// boot.js: a safety net for the first screen (Fixer, 1 Nov, "stuck on Loading schools…").
// It loads before the rest of the app. If the app hasn't drawn its first screen after a while, or a
// script fails to load or crashes, it swaps "Loading schools…" for a clear message and a Try again button.
// Try again throws away the copy of SchoolMap saved on the phone (service worker + saved files),
// fetches fresh files and reloads, so a parent stuck on an old saved version gets unstuck too.
(function () {
  "use strict";

  var WAIT_MS = 15000;       // slow phone on a weak signal: give it this long before offering Try again
  var AFTER_ERROR_MS = 3000; // a script failed: wait a moment in case the app still draws
  var FILES = ["./", "index.html", "styles.css", "js/boot.js", "js/logic.js", "js/admissions.js", "js/places.js",
    "js/app.js", "js/count.js", "data/index.json"];
  var shown = false;

  function stillLoading() { return !!document.getElementById("boot-loading"); }

  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text) n.textContent = text;
    return n;
  }

  // Remove the saved copy, refresh the browser's own copy of each file, then reload.
  function freshStart(button) {
    if (button) { button.disabled = true; button.textContent = "Getting a fresh copy…"; }
    var jobs = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }));
      }
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }));
      }
      if (window.fetch) {
        jobs.push(Promise.all(FILES.map(function (f) {
          return fetch(f, { cache: "reload" }).catch(function () { return null; });
        })));
      }
    } catch (e) { /* old browser: just reload */ }
    var done = false;
    function reload() { if (!done) { done = true; location.reload(); } }
    Promise.all(jobs.map(function (j) { return j.catch(function () { return null; }); })).then(reload, reload);
    setTimeout(reload, 8000); // never leave the button stuck either
  }

  // The message itself. app.js uses this too when the school list can't be downloaded.
  function showProblem(container) {
    var main = container || document.getElementById("app");
    if (!main) return;
    main.textContent = "";
    main.appendChild(make("h1", "screen-title", "Couldn't load the schools"));
    main.appendChild(make("p", "", "This is usually a weak or slow internet connection. Check your signal, then tap Try again."));
    var button = make("button", "btn solid", "Try again");
    button.type = "button";
    button.addEventListener("click", function () { freshStart(button); });
    main.appendChild(button);
  }

  function giveUp() {
    if (shown || !stillLoading()) return;
    shown = true;
    showProblem();
  }

  window.SchoolMapBoot = { showProblem: showProblem, freshStart: freshStart };

  setTimeout(giveUp, WAIT_MS);
  // A script that fails to download (capture phase sees it) or crashes before the first screen.
  window.addEventListener("error", function (e) {
    var t = e && e.target;
    if (t && t !== window && t.tagName !== "SCRIPT" && t.tagName !== "LINK") return; // a missing picture is fine
    setTimeout(giveUp, AFTER_ERROR_MS);
  }, true);
  window.addEventListener("unhandledrejection", function () { setTimeout(giveUp, AFTER_ERROR_MS); });
})();
