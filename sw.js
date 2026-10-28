// sw.js — the "service worker": a small script the phone keeps running in the background.
// It saves the app's files so School Finder opens and works with no internet (load shedding, no data).

var VERSION = "v23";                       // bump this when app files change, so phones fetch the new ones
var APP_FILES = [
  "./", "index.html", "styles.css", "js/logic.js", "js/admissions.js", "js/places.js", "js/app.js", "manifest.webmanifest",
  "fonts/plus-jakarta-sans-latin.woff2", "icons/icon-192.png", "icons/icon-512.png", "data/index.json", "data/countries/za.json"
];

// First install: save all app files.
self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(APP_FILES); }));
  self.skipWaiting();
});

// New version: delete files saved by older versions.
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  // School data and the app's code: try the internet first so prices and cost maths are always fresh and match
  // each other (new data with old code gave wrong totals). Fall back to the saved copy when offline.
  if ((url.pathname.indexOf("/data/") !== -1 && url.pathname.endsWith(".json")) || /\/js\/[^/]+\.js$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then(function (response) {
      // Only save a good response, so a server error can't replace the offline copy.
      if (!response.ok) return caches.match(event.request).then(function (saved) { return saved || response; });
      var copy = response.clone();
      caches.open(VERSION).then(function (cache) { cache.put(event.request, copy); });
      return response;
    }).catch(function () { return caches.match(event.request); }));
    return;
  }

  // Everything else (the app itself): use the saved copy, it's instant and works offline.
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (saved) {
    return saved || fetch(event.request);
  }));
});
