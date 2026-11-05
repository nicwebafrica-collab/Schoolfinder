// head.js: runs in <head> before the page is drawn, so it's tiny and must stay tiny (it's not deferred).
// "js" shows the "Loading schools…" line (styles.css hides it when JavaScript is off). "deep-link" hides the
// home-page text on a shared school or Compare link, so it doesn't flash up before the school (T10).
(function () {
  var c = document.documentElement.classList;
  c.add("js");
  if (/^#\/?(school|compare)\//.test(location.hash)) c.add("deep-link");
})();
