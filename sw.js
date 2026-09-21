/* Neon Pain-T service worker.

   Same idea as Vapor Lane's: the page is network-first and the icons are
   cache-first. That split is the point: you never have to bump CACHE to see a
   new build, because index.html is re-fetched on every launch and only falls
   back to the cached copy when the phone is offline. Bump CACHE only when you
   change the icons, the manifest or this file itself.

   Shared-origin note: on GitHub Pages every repo under one account is served
   from the same origin (username.github.io), and Cache Storage belongs to the
   origin, not to the path. So this worker only ever reads, writes or deletes
   caches that carry its own prefix. Deleting "every cache that is not the
   current one" would wipe the other game's offline copy each time this file
   updates, and the other game's worker would do the same to this one. */

const CACHE_PREFIX = 'neon-pain-t-';
const CACHE = CACHE_PREFIX + 'v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-180.png',
  './favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      /* Individually, so one 404 cannot fail the whole install the way
         cache.addAll() would. */
      .then(function (c) {
        return Promise.all(ASSETS.map(function (u) {
          return c.add(u).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      /* Only this game's own old caches. */
      return Promise.all(keys.map(function (k) {
        return (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE) ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Look in this game's cache only, never across the whole origin. */
function fromCache(req) {
  return caches.open(CACHE).then(function (c) { return c.match(req); });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   /* leave anything external alone */

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return r;
      }).catch(function () {
        return fromCache('./index.html').then(function (hit) {
          return hit || fromCache('./');
        });
      })
    );
    return;
  }

  e.respondWith(
    fromCache(e.request).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
