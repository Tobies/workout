// Service worker — cache-first app shell for offline use + installability,
// plus the stretch-reminder push notification.
// Bump CACHE when shipping changes so old caches are cleared.

const CACHE = 'slworkout-v46';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/state.js',
  './js/workouts.js',
  './js/stretches.js',
  './js/timer.js',
  './js/system.js',
  './js/feedback.js',
  './js/challenges.js',
  './js/icons.js',
  './js/push.js',
  './assets/icons/icon.svg',
  './assets/icons/notify-192.png',
  './assets/icons/badge-96.png',
  './assets/fonts/playpen-hebrew.woff2',
  './assets/fonts/playpen-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Leave cross-origin requests (e.g. the in-app YouTube embed iframe) to the
  // browser — never answer them with the cached app shell.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    // ignoreSearch: a notification tap opens "./?open=stretch" — same shell.
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((resp) => {
          // Cache same-origin successful responses for next time.
          if (resp.ok && new URL(request.url).origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

// ---- Stretch reminder (Web Push) -------------------------------------------
// Sent by the repo's GitHub Actions cron (.github/scripts/send-push.mjs); the
// payload is JSON { title, body, url, silent }. Silent by default — the owner
// wants a quiet morning nudge, not an alarm.

const NOTIFY_ICON = './assets/icons/notify-192.png';
const NOTIFY_BADGE = './assets/icons/badge-96.png';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {
    try { data = { body: event.data.text() }; } catch { /* no payload */ }
  }
  const title = data.title || 'זמן למתיחות';
  const options = {
    body: data.body || 'כמה דקות של מתיחות — פותחים את היום',
    icon: NOTIFY_ICON,
    badge: NOTIFY_BADGE,
    tag: data.tag || 'stretch-reminder', // one reminder at a time; a new one replaces it
    renotify: false,
    silent: data.silent !== false,
    lang: 'he',
    dir: 'rtl',
    data: { url: data.url || './?open=stretch' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tap → open the app on the stretching routine. Reuse an open window when
// there is one (it gets a message and decides), else open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((c) => new URL(c.url).origin === self.location.origin);
      if (win) {
        try { win.postMessage({ type: 'open', view: 'stretch' }); } catch { /* ignore */ }
        return 'focus' in win ? win.focus() : undefined;
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});

// The browser rotated/expired the subscription. There is no server to tell,
// so ask the owner to re-copy the new subscription from Settings.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.showNotification('ההרשמה לתזכורת התחדשה', {
      body: 'פתח הגדרות ← תזכורת מתיחות והעתק מחדש את המנוי ל-GitHub',
      icon: NOTIFY_ICON,
      badge: NOTIFY_BADGE,
      tag: 'stretch-resubscribe',
      lang: 'he',
      dir: 'rtl',
      data: { url: './?open=reminder' },
    })
  );
});
