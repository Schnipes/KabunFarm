const CACHE_NAME = 'farmlog-cache-c635c7f';

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