// sw.js — the "service worker": a small script the phone keeps running in the background.
// It saves the app's files so SchoolMap opens and works with no internet (load shedding, no data).

var VERSION = "v84";                       // bump this when app files change, so phones fetch the new ones
var APP_FILES = [
  "./", "index.html", "styles.css", "js/head.js", "js/boot.js", "js/logic.js", "js/admissions.js", "js/places.js", "js/app.js", "js/count.js", "manifest.webmanifest",
  "fonts/plus-jakarta-sans-latin.woff2", "icons/icon-192.png", "icons/icon-512.png", "data/index.json", "data/countries/za.json"
];

// First install: save all app files.
self.addEventListener("install", function (event) {
  // cache: "reload" skips the browser's own 10-minute cache, so a new version never saves yesterday's files.
  // Each file is saved on its own, so one missing or slow file can't stop the new version installing
  // (an all-or-nothing save could leave phones on an old version).
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    return Promise.all(APP_FILES.map(function (f) {
      return cache.add(new Request(f, { cache: "reload" })).catch(function () { return null; });
    }));
  }));
  self.skipWaiting();
});

// New version: delete files saved by older versions.
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

// A page that was never opened, asked for with no internet (B60): a short plain message instead of the browser's
// error page. Fixed text only, no scripts, and a policy that blocks everything else.
function offlinePage() {
  var html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; base-uri 'none'; form-action 'none'\">" +
    "<title>You're offline · SchoolMap</title></head><body>" +
    "<h1>You're offline</h1>" +
    "<p>This page isn't saved on your phone yet. Connect to Wi-Fi or mobile data and try again.</p>" +
    "<p><a href=\"/\">Open SchoolMap</a> to see the schools saved on this phone.</p>" +
    "</body></html>";
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  // The page, its look, its code and school data: try the internet first so every visit gets the latest version
  // (and data, code and styles always match). Fall back to the saved copy when offline. Fonts and icons stay cache-first.
  var fresh = url.pathname.endsWith("/") || /\.(html|css|js|json|webmanifest)$/.test(url.pathname);
  if (fresh) {
    // A weak signal can leave a download hanging: after 8 seconds use the saved copy, if there is one.
    var network = fetch(event.request, { cache: "no-cache" });
    var slow = new Promise(function (ok, fail) { setTimeout(function () { fail(new Error("slow")); }, 8000); });
    event.respondWith(Promise.race([network, slow]).then(function (response) {
      // The site has moved (to schoolmap.co.za): let the browser follow the move instead of showing the old saved copy.
      if (response.type === "opaqueredirect") return response;
      // Only save a good response, so a server error can't replace the offline copy.
      if (!response.ok) return caches.match(event.request).then(function (saved) { return saved || response; });
      var copy = response.clone();
      caches.open(VERSION).then(function (cache) { cache.put(event.request, copy); });
      return response;
    }).catch(function () {
      // Offline or too slow: the saved copy. With no saved copy keep waiting for the internet,
      // and if that fails too, answer with an error (never nothing, which leaves the page stuck).
      return caches.match(event.request, { ignoreSearch: true }).then(function (saved) {
        return saved || network.catch(function () {
          return event.request.mode === "navigate" ? offlinePage() : Response.error();
        });
      });
    }));
    return;
  }

  // Everything else (the app itself): use the saved copy, it's instant and works offline.
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (saved) {
    return saved || fetch(event.request).catch(function () { return Response.error(); });
  }));
});
