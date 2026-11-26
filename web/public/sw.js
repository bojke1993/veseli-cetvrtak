/*
 * Veseli četvrtak — service worker only for Web Push (BR-41, P-28). It caches nothing and has no
 * fetch handler: the app always loads from the network.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Veseli četvrtak';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'vc',
      // A new chat message replaces the previous notification but still rings.
      renotify: true,
      icon: '/icon.svg',
      lang: 'sr-Latn',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if (client.url !== url && 'navigate' in client) {
          try {
            await client.navigate(url);
          } catch {
            // navigate() fails for uncontrolled clients; the app is focused anyway
          }
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
