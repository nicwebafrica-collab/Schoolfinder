// count.js — counts page views with GoatCounter (goatcounter.com), so we know how many parents use SchoolMap.
// No cookies, nothing saved on the phone, nothing about the parent: only which screen was opened
// (e.g. "/school/waterfall-college") and which website sent them (e.g. "facebook.com").
// Skipped when the browser asks not to be tracked, when offline, and when running anywhere but the live site.
// Reviewed by Security: don't add anything to what is sent without asking.

(function () {
  var ENDPOINT = "https://greendragon.goatcounter.com/count";
  var LIVE_HOST = "nicwebafrica-collab.github.io";

  if (location.hostname !== LIVE_HOST) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;

  // Only the kind of screen and a school id. Never searches, suburbs, locations or saved/compare lists.
  function screenPath() {
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var id = /^[a-z0-9-]{1,80}$/.test(parts[1] || "") ? parts[1] : "";
    if (parts[0] === "school") return "/school/" + id + (parts[2] === "costs" ? "/costs" : "");
    if (parts[0] === "compare" || parts[0] === "saved" || parts[0] === "privacy") return "/" + parts[0];
    return "/";
  }

  // Only the referring website's name (e.g. "facebook.com"), never the full link.
  function referrerSite() {
    try {
      var r = new URL(document.referrer);
      return r.hostname === LIVE_HOST ? "" : r.hostname;
    } catch (e) { return ""; }
  }

  var last = null;
  function count() {
    var path = screenPath();
    if (path === last || navigator.onLine === false) return;
    last = path;
    var url = ENDPOINT + "?p=" + encodeURIComponent(path) + "&r=" + encodeURIComponent(referrerSite()) +
      "&rnd=" + Math.random().toString(36).slice(2);
    var img = document.createElement("img");
    img.setAttribute("alt", "");
    img.setAttribute("referrerpolicy", "no-referrer");
    img.setAttribute("src", url);
  }

  count();
  window.addEventListener("hashchange", count);
})();
