const CACHE_NAME = 'farmlog-cache-c533d89';

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  // Only cache-first for same-origin (local app files).
  // External requests (Firebase SDK, Open-Meteo API) bypass the SW entirely
  // so they always get the latest version from the network.
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(names => Promise.all(
        names.map(name => name !== CACHE_NAME && caches.delete(name))
      ))
    ])
  );
});