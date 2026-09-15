// Web Push subscription helpers for the daily stretch reminder.
//
// The app is a static site with no server, so nothing here *sends* pushes. The
// browser hands us a subscription (endpoint + keys); the owner copies it once
// into the repo's PUSH_SUBSCRIPTIONS secret, and the GitHub Actions cron
// (.github/workflows/stretch-reminder.yml → .github/scripts/send-push.mjs)
// posts the reminder to it every morning. sw.js shows the notification.
//
// VAPID_PUBLIC_KEY is the public half of the sender's signing key pair; the
// private half lives ONLY in the VAPID_PRIVATE_KEY repo secret. Rotating the
// pair = new key here + new secret + re-enable the reminder on every device.

export const VAPID_PUBLIC_KEY = 'BJvTOSFFPZLHDgecbYcvfIuIya8-mvh0n0DtjsE053NfSmtvf0vLSJ51mrPgRS22RD9LR0wNPxKBO9bUmzPZ-E0';

const READY_TIMEOUT_MS = 8000;

export function pushSupported() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function permission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

// serviceWorker.ready never settles when registration failed (file://, old
// browser) — cap the wait so the Settings row can't hang forever.
function registration() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), READY_TIMEOUT_MS)),
  ]);
}

// base64url → Uint8Array (applicationServerKey wants raw bytes).
function keyBytes(b64u) {
  const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
  const raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function getSubscription() {
  if (!pushSupported()) return null;
  try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
}

// 'unsupported' | 'blocked' | 'on' | 'off'
export async function status() {
  if (!pushSupported()) return 'unsupported';
  if (permission() === 'denied') return 'blocked';
  return (await getSubscription()) ? 'on' : 'off';
}

// Ask permission + create this device's subscription. Throws Error('denied')
// when the permission prompt is declined.
export async function subscribe() {
  if (!pushSupported()) throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await registration();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
}

export async function unsubscribe() {
  const sub = await getSubscription();
  if (sub) await sub.unsubscribe();
}

// The JSON the owner pastes into the PUSH_SUBSCRIPTIONS secret.
export function subscriptionText(sub) {
  return JSON.stringify(sub && sub.toJSON ? sub.toJSON() : sub, null, 2);
}

// Local preview of the reminder — same look as the real push, no server needed.
export async function showTest() {
  const reg = await registration();
  return reg.showNotification('זמן למתיחות', {
    body: 'ככה תיראה התזכורת בכל בוקר ב-9:00',
    icon: './assets/icons/notify-192.png',
    badge: './assets/icons/badge-96.png',
    tag: 'stretch-test',
    silent: true,
    lang: 'he',
    dir: 'rtl',
    data: { url: './?open=stretch' },
  });
}
