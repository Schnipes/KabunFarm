const CACHE_NAME = 'farmlog-cache-b8b46b2';

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './js/state.js',
  './js/calculations.js',
  './js/db.js',
  './js/views.js',
  './js/app.js',
  './manifest.json',
  './scripts/firebase-app-compat.js',
  './scripts/firebase-firestore-compat.js'
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