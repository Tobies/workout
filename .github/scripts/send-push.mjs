// Daily stretch-reminder sender — Web Push with Node built-ins only (no npm).
//
// Why this exists: the app is a static GitHub Pages site with no server, and a
// Web Push message has to be POSTed to the browser's push service by *someone*.
// This script runs from the repo's GitHub Actions cron
// (.github/workflows/stretch-reminder.yml) and plays the "application server":
//   RFC 8030  Web Push protocol  — POST to the subscription endpoint (TTL/Urgency/Topic)
//   RFC 8291  payload encryption — ECDH P-256 + HKDF-SHA256 + AES-128-GCM ("aes128gcm")
//   RFC 8292  VAPID              — ES256 JWT proving we own the key pair the app subscribed with
//
// Environment (set by the workflow):
//   VAPID_PRIVATE_KEY   base64url 32-byte P-256 scalar. Repo secret — never committed.
//   VAPID_PUBLIC_KEY    base64url 65-byte uncompressed point. Optional: defaults to the
//                       VAPID_PUBLIC_KEY constant in js/push.js (the key the app subscribes with).
//   PUSH_SUBSCRIPTIONS  JSON — one PushSubscription (as copied from Settings) or an array of them.
//   VAPID_SUBJECT       contact URI for the push service (mailto:/https:). Defaults to the Pages URL.
//   SCHEDULE            github.event.schedule — the cron expression that fired. Empty (manual
//                       workflow_dispatch) = send right now, no time-of-day check.
//   REMINDER_TZ         IANA zone the reminder hour is expressed in (default Asia/Jerusalem).
//   REMINDER_HOUR       local hour to send at (default 9). The workflow has one cron per UTC
//                       offset (summer/winter); the run whose *nominal* time lands on this
//                       hour sends, the other exits quietly — robust to GitHub's queue delays.
//   TITLE / BODY        optional notification text overrides.

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => Buffer.from(String(s).trim(), 'base64url');

// ---- RFC 8291: aes128gcm content encryption ---------------------------------
// Returns the encrypted message body: header (salt | rs | idlen | as_public)
// followed by the single AES-GCM record (plaintext | 0x02 delimiter) + tag.
// `asPrivate`/`salt` are injectable for the RFC test vector; production uses a
// fresh ephemeral key pair and random salt per message.
export function encryptPayload(plaintext, subscription, { asPrivate, salt } = {}) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('subscription keys.p256dh must be a 65-byte uncompressed P-256 point');
  if (authSecret.length !== 16) throw new Error('subscription keys.auth must be 16 bytes');

  const ecdh = crypto.createECDH('prime256v1');
  if (asPrivate) ecdh.setPrivateKey(asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // uncompressed, 65 bytes
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  salt = salt || crypto.randomBytes(16);

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  // CEK / NONCE = HKDF(salt, IKM, "Content-Encoding: aes128gcm|nonce" || 0x00)
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

  const record = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]); // 0x02 = last record
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16); // record size
  header[20] = asPublic.length;   // key id length
  return Buffer.concat([header, asPublic, encrypted]);
}

// ---- RFC 8292: VAPID ---------------------------------------------------------
function vapidPrivateKeyObject(publicKeyB64, privateKeyB64) {
  const pub = unb64u(publicKeyB64);
  const d = unb64u(privateKeyB64);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be a base64url 65-byte uncompressed P-256 point');
  if (d.length !== 32) throw new Error('VAPID_PRIVATE_KEY must be a base64url 32-byte scalar');
  // The private scalar must generate exactly the public point the app subscribed with,
  // otherwise the push service rejects the JWT (and a rotated key would fail silently).
  const check = crypto.createECDH('prime256v1');
  check.setPrivateKey(d);
  if (!check.getPublicKey().equals(pub)) throw new Error('VAPID key pair mismatch: VAPID_PRIVATE_KEY does not match the public key in js/push.js');
  return crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(d) },
  });
}

// "vapid t=<ES256 JWT>, k=<public key>" for the push service at `endpoint`.
export function vapidAuthorization(endpoint, publicKeyB64, privateKeyB64, subject, { expiresInSec = 12 * 3600, now = Date.now() } = {}) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + expiresInSec, sub: subject }));
  const input = `${header}.${claims}`;
  const key = vapidPrivateKeyObject(publicKeyB64, privateKeyB64);
  const sig = crypto.sign('sha256', Buffer.from(input, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }); // raw r||s per JWS
  return `vapid t=${input}.${b64u(sig)}, k=${publicKeyB64}`;
}

// ---- RFC 8030: deliver one message -------------------------------------------
export async function sendPush(subscription, payload, vapid, { ttl = 6 * 3600, topic = 'stretch-reminder', urgency = 'normal', fetchFn = globalThis.fetch } = {}) {
  const body = encryptPayload(JSON.stringify(payload), subscription);
  const res = await fetchFn(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(ttl),         // keep for the morning if the phone is offline at 9:00
      Urgency: urgency,
      Topic: topic,             // a newer reminder replaces an undelivered older one
      Authorization: vapidAuthorization(subscription.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
    },
    body,
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.status === 201 || res.ok, gone: res.status === 404 || res.status === 410, text };
}

// ---- Time-of-day gate --------------------------------------------------------
function hourIn(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour').value);
}

// Decide from the cron that fired (its NOMINAL time, so a delayed run still
// counts) whether this run is the one landing on REMINDER_HOUR local time.
export function shouldSendNow({ schedule, tz, hour, now = new Date() }) {
  if (!schedule) return { send: true, why: 'manual run — sending now' };
  const m = /^\s*(\d{1,2})\s+(\d{1,2})\s/.exec(schedule);
  if (!m) return { send: true, why: `unrecognized schedule "${schedule}" — sending anyway` };
  const nominal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[2]), Number(m[1])));
  const localHour = hourIn(tz, nominal);
  const send = localHour === hour;
  return { send, why: `cron "${schedule}" is ${String(localHour).padStart(2, '0')}:${m[1].padStart(2, '0')} in ${tz}${send ? ' — sending' : ` (want ${String(hour).padStart(2, '0')}:xx)`}` };
}

// ---- Inputs ------------------------------------------------------------------
export function parseSubscriptions(raw) {
  if (!raw || !String(raw).trim()) return [];
  let v;
  try { v = JSON.parse(raw); } catch { throw new Error('PUSH_SUBSCRIPTIONS is not valid JSON'); }
  const list = Array.isArray(v) ? v : [v];
  return list.map((s, i) => {
    if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || !s.keys || !s.keys.p256dh || !s.keys.auth) {
      throw new Error(`PUSH_SUBSCRIPTIONS entry #${i + 1} is not a PushSubscription ({ endpoint, keys: { p256dh, auth } })`);
    }
    return s;
  });
}

export function publicKeyFromApp() {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../js/push.js');
  const m = /VAPID_PUBLIC_KEY\s*=\s*'([A-Za-z0-9_-]+)'/.exec(readFileSync(file, 'utf8'));
  if (!m) throw new Error('VAPID_PUBLIC_KEY not found in js/push.js');
  return m[1];
}

function pagesUrl(repo) {
  const [owner, name] = String(repo || '').split('/');
  return owner && name ? `https://${owner.toLowerCase()}.github.io/${name}/` : 'https://tobies.github.io/workout/';
}

// ---- Main --------------------------------------------------------------------
async function main() {
  const env = process.env;
  const gate = shouldSendNow({ schedule: env.SCHEDULE || '', tz: env.REMINDER_TZ || 'Asia/Jerusalem', hour: Number(env.REMINDER_HOUR || 9) });
  console.log(gate.why);
  if (!gate.send) { console.log('Not the reminder hour for this run — nothing to do.'); return; }

  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim();
  if (!privateKey) throw new Error('VAPID_PRIVATE_KEY secret is missing');
  const publicKey = (env.VAPID_PUBLIC_KEY || '').trim() || publicKeyFromApp();
  const subs = parseSubscriptions(env.PUSH_SUBSCRIPTIONS);
  if (!subs.length) throw new Error('PUSH_SUBSCRIPTIONS secret is missing/empty — enable the reminder in the app (Settings → תזכורת מתיחות) and paste the subscription there');
  const subject = (env.VAPID_SUBJECT || '').trim() || pagesUrl(env.GITHUB_REPOSITORY);

  const payload = {
    type: 'stretch',
    title: env.TITLE || 'זמן למתיחות',
    body: env.BODY || '8 החזקות · 40 שניות כל אחת · כ-6 דקות',
    url: './?open=stretch',
    silent: true,
  };

  let failed = 0;
  for (const [i, sub] of subs.entries()) {
    const host = new URL(sub.endpoint).host;
    try {
      const r = await sendPush(sub, payload, { publicKey, privateKey, subject });
      if (r.ok) {
        console.log(`#${i + 1} ${host}: sent (HTTP ${r.status})`);
      } else {
        failed += 1;
        const hint = r.gone ? ' — subscription expired/unsubscribed: re-enable the reminder in Settings and update PUSH_SUBSCRIPTIONS' : '';
        console.error(`#${i + 1} ${host}: HTTP ${r.status}${hint} ${r.text.slice(0, 300)}`);
      }
    } catch (e) {
      failed += 1;
      console.error(`#${i + 1} ${host}: ${e.message}`);
    }
  }
  if (failed) throw new Error(`${failed}/${subs.length} subscription(s) failed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
