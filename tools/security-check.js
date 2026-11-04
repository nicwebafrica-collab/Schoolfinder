#!/usr/bin/env node
// security-check.js — automatic security checks. Run before every release:
//   node tools/security-check.js
// It runs on GitHub before every deploy too, and if any check fails the website is NOT updated.
// No packages needed, just Node.

var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var failures = [];
var passed = 0;

function fail(msg) { failures.push(msg); }
function check(ok, msg) { if (ok) passed++; else fail(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function walk(dir) {
  var out = [];
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function (d) {
    var rel = path.join(dir, d.name);
    if (d.name === ".git" || d.name === "node_modules") return;
    if (d.isDirectory()) out = out.concat(walk(rel)); else out.push(rel);
  });
  return out;
}

var allFiles = walk(".");
var textFiles = allFiles.filter(function (f) { return /\.(js|json|html|css|md|yml|yaml|webmanifest|txt|py)$|LICENSE$|\.gitignore$/.test(f); });
var jsFiles = allFiles.filter(function (f) { return /^js\/.*\.js$/.test(f) || f === "sw.js"; });

// 1. No secrets anywhere (API keys, tokens, private keys, passwords).
var SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_\-]{35}/, "Google API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/\bsk_(live|test)_[A-Za-z0-9]{16,}/, "Stripe secret key"],
  [/\bsk-(?=[A-Za-z0-9_\-]*[A-Z])(?=[A-Za-z0-9_\-]*[0-9])[A-Za-z0-9_\-]{32,}/, "API secret key"], // real keys mix capitals and digits; school ids like "sk-moseneke-..." are lowercase
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/(password|passwd|secret|api_?key|access_?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, "hard-coded password or key"]
];
textFiles.forEach(function (f) {
  if (f === "tools/security-check.js") return; // this file lists the patterns themselves
  var text = read(f);
  SECRET_PATTERNS.forEach(function (p) { check(!p[0].test(text), f + ": looks like a " + p[1] + ". Remove it and change that key."); });
});
var forbidden = allFiles.filter(function (f) { return /(^|\/)\.env|\.(keystore|jks|p12|pem|key|mobileprovision)$/.test(f); });
check(forbidden.length === 0, "Secret or signing files must never be in the project: " + forbidden.join(", "));

// 2. Dangerous code: anything that could turn school text into running code.
var DANGEROUS = [
  [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/, "innerHTML/outerHTML (use textContent or el())"],
  [/document\.write/, "document.write"],
  [/\beval\s*\(/, "eval()"],
  [/new\s+Function\s*\(/, "new Function()"],
  [/set(Timeout|Interval)\s*\(\s*["'`]/, "setTimeout/setInterval with a string"],
  [/setAttribute\(\s*["']on/i, "an inline event handler (onclick etc.)"],
  [/\.on\w+\s*=\s*["'`]/, "an inline event handler string"],
  [/javascript:/i, "a javascript: link"],
  [/window\.open\s*\(/, "window.open (use a link with rel=noopener noreferrer)"],
  [/\.(href|src)\s*=\s*(?!["'`#])/, "setting href/src directly (go through safeUrl())"]
];
jsFiles.forEach(function (f) {
  var lines = read(f).split("\n");
  lines.forEach(function (line, i) {
    if (/^\s*\/\//.test(line)) return; // comments are fine
    DANGEROUS.forEach(function (d) {
      if (d[0].test(line)) fail(f + ":" + (i + 1) + ": uses " + d[1]);
    });
  });
  passed++;
});

// 3. Every link that opens a new tab must also have rel noopener noreferrer.
jsFiles.forEach(function (f) {
  var text = read(f);
  var re = /target:\s*["']_blank["'][^}]*\}/g, m;
  while ((m = re.exec(text))) check(/rel:\s*["']noopener noreferrer["']/.test(m[0]), f + ": a target _blank link is missing rel: \"noopener noreferrer\"");
});

// 4. Only these things may be stored on the phone. Anything new needs Security's OK and a line on the privacy page.
var ALLOWED_STORAGE = ["savedSchools", "lastPlace", "homeTipHiddenUntil"];
jsFiles.forEach(function (f) {
  var text = read(f);
  check(!/sessionStorage|indexedDB|document\.cookie/.test(text), f + ": uses cookies/sessionStorage/IndexedDB (not allowed without Security review)");
  var re = /localStorage\.(?:getItem|setItem|removeItem)\(\s*["']([^"']+)["']/g, m;
  while ((m = re.exec(text))) check(ALLOWED_STORAGE.indexOf(m[1]) !== -1, f + ": stores \"" + m[1] + "\" on the phone, which is not on the allowed list");
  check(!/localStorage\.(?:getItem|setItem)\(\s*[^"'\s]/.test(text), f + ": localStorage key must be a fixed text, not a variable");
});

// 5. Location: never precise, never sent anywhere, never saved.
var app = read("js/app.js");
check(!/enableHighAccuracy\s*:\s*true/.test(app), "js/app.js: asks for high-accuracy (exact) location");
check(!/watchPosition/.test(app), "js/app.js: tracks location continuously (watchPosition)");
check(/Math\.round\(pos\.coords\.latitude \* 100\) \/ 100/.test(app) && /Math\.round\(pos\.coords\.longitude \* 100\) \/ 100/.test(app),
  "js/app.js: the location must be rounded to 2 decimals (about 1 km) as soon as it arrives");
jsFiles.forEach(function (f) {
  var text = read(f);
  check(!/coords[\s\S]{0,200}(localStorage|fetch\(|sendBeacon|XMLHttpRequest)/.test(text), f + ": location may be saved or sent");
  check(!/sendBeacon|XMLHttpRequest|WebSocket|EventSource/.test(text), f + ": opens a network connection (only fetch of our own data files is allowed)");
  var fetches = text.match(/fetch\(([^)]*)\)/g) || [];
  fetches.forEach(function (call) {
    check(!/https?:/.test(call), f + ": fetches from another website: " + call);
  });
  // Outside websites the code may mention. The visitor counter host is allowed only in js/count.js.
  var OUTSIDE_OK = { "www.w3.org": "any", "docs.github.com": "any", "www.goatcounter.com": "js/app.js", "wa.me": "js/app.js", "greendragon.goatcounter.com": "js/count.js" };
  (text.match(/https?:\/\/[a-z0-9.\-]+/gi) || []).forEach(function (u) {
    var host = u.replace(/^https?:\/\//i, "").toLowerCase();
    check(OUTSIDE_OK[host] === "any" || OUTSIDE_OK[host] === f, f + ": mentions an outside website (" + host + "). Ask Security first");
  });
});
// The visitor counter may only send the screen and the referring site (Security review, 2026-10-28).
if (fs.existsSync(path.join(root, "js/count.js"))) {
  var cnt = read("js/count.js").replace(/^\s*\/\/.*$/gm, ""); // ignore comments
  var params = (cnt.match(/[?&]([a-z]+)=/g) || []).map(function (p) { return p.slice(1, -1); });
  check(params.every(function (p) { return ["p", "r", "rnd"].indexOf(p) !== -1; }), "js/count.js: sends something other than the screen and referring site: " + params.join(", "));
  check(!/localStorage|cookie|coords|state\.|getSaved|lastPlace|userAgent|screen\.|language/.test(cnt), "js/count.js: must not read saved data, location, cookies or device details");
  check(/doNotTrack/.test(cnt), "js/count.js: must respect Do Not Track");
}

// 6. The page itself: strict Content-Security-Policy, nothing loaded from other websites.
var html = read("index.html");
var cspMatch = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
check(!!cspMatch, "index.html: Content-Security-Policy is missing");
if (cspMatch) {
  var csp = cspMatch[1];
  ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].forEach(function (d) {
    check(csp.indexOf(d) !== -1, "index.html: CSP must include " + d);
  });
  check(!/unsafe-inline|unsafe-eval|\*|https?:|data:[^;]*script/.test(csp.replace(/img-src 'self' data:( https:\/\/greendragon\.goatcounter\.com)?/, "")), "index.html: CSP allows unsafe sources: " + csp);
}
check(!/<script(?![^>]*src="js\/)[^>]*>/.test(html), "index.html: has an inline script or a script from somewhere else");
check(!/(src|href)="(https?:)?\/\//.test(html.replace('<link rel="canonical" href="https://schoolmap.co.za/">', "")), "index.html: loads something from another website"); // the canonical link only names our own address
check(!/\son\w+=/.test(html), "index.html: has an inline event handler");
check(/<meta name="referrer" content="(strict-origin-when-cross-origin|no-referrer)">/.test(html), "index.html: referrer policy missing");
check(!/@import|url\(\s*["']?(https?:)?\/\//.test(read("styles.css")), "styles.css: loads something from another website");

// 7. School data: every file parses, every link is http/https, and the cleaning code copes with it.
var L = require(path.join(root, "js/admissions.js"));
require(path.join(root, "js/places.js"));
var dataFiles = allFiles.filter(function (f) { return /^data\/.*\.json$/.test(f) && !/\.old\.json$/.test(f); });
dataFiles.forEach(function (f) {
  var data;
  try { data = JSON.parse(read(f)); } catch (e) { fail(f + ": is not valid JSON (" + e.message + ")"); return; }
  passed++;
  (function scan(v, where) {
    if (typeof v === "string") {
      if (/^\s*(javascript|data|vbscript|file):/i.test(v)) fail(f + ": " + where + " has a dangerous link: " + v.slice(0, 60));
      if (/<\s*(script|iframe|img|svg|a|object|embed|style)\b|on\w+\s*=/i.test(v)) fail(f + ": " + where + " contains HTML (strip it at import): " + v.slice(0, 60));
      if (/^https?:/i.test(v) && !L.safeUrl(v)) fail(f + ": " + where + " has a broken link: " + v.slice(0, 60));
    } else if (v && typeof v === "object") {
      Object.keys(v).forEach(function (k) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") fail(f + ": " + where + " uses the forbidden key " + k);
        scan(v[k], where + "." + k);
      });
    }
  })(data, f.replace(/^data\//, ""));
  if (/^data\/schools\//.test(f)) {
    var cleaned = L.cleanSchools(data);
    check(Array.isArray(data) && cleaned.length === data.length, f + ": " + (Array.isArray(data) ? data.length - cleaned.length : "all") + " school record(s) are broken and would be hidden");
  }
});
var index = JSON.parse(read("data/index.json"));
// Each area's tiles: data/schools/<area>/<tile>.json. Every tile listed exists and every tile file is listed.
function tilePath(a, t) { return "schools/" + a.id + "/" + t + ".json"; }
var listedTiles = {};
(index.areas || []).forEach(function (a) {
  check(/^[a-z0-9][a-z0-9-]*$/.test(String(a.id)) && Array.isArray(a.tiles) && a.tiles.length > 0, "data/index.json: area " + a.id + " needs a safe id and a list of tiles");
  (a.tiles || []).forEach(function (t) {
    check(/^[a-z0-9][a-z0-9-]{0,40}$/.test(String(t)), "data/index.json: bad tile name " + t);
    listedTiles["data/" + tilePath(a, t)] = true;
  });
  [a.search, a.rules].concat((a.tiles || []).map(function (t) { return tilePath(a, t); })).filter(Boolean).forEach(function (p) {
    check(/^[a-z0-9\-\/]+\.json$/.test(p) && p.indexOf("..") === -1 && fs.existsSync(path.join(root, "data", p)), "data/index.json: bad file path " + p);
  });
});
allFiles.filter(function (f) { return /^data\/schools\//.test(f); }).forEach(function (f) {
  check(!!listedTiles[f], f + ": not listed in data/index.json (left over from old data?). Rebuild the data");
});

// 8. The cleaning code must survive junk without crashing (a bad scrape must never break the app).
var JUNK = [null, undefined, 0, -1, NaN, Infinity, "", "x", [], {}, [null], { id: {} }, { id: "a", name: { x: 1 } },
  { id: "__proto__", name: "p" }, { id: "b", name: "B", fees: "lots", hiddenCosts: [{ item: {}, amount: "R1e9" }, 5], outings: {}, lat: "1", website: "javascript:alert(1)", sources: [{}], admissions: [] },
  { id: "c", name: "C".repeat(100000), fees: { byGrade: [{ grade: [] }, null] }, hiddenCosts: [{ item: "x", amount: "9".repeat(5000) + ",00", frequency: { a: 1 } }] }];
try {
  var cleanedJunk = L.cleanSchools(JUNK.concat([JUNK]));
  L.cleanSchools(JUNK[12]); L.cleanSchools("x"); L.cleanAdmissionsFile({ schools: JSON.parse('{"__proto__":{"rules":["x"]},"constructor":{}}') });
  cleanedJunk.forEach(function (s) {
    check(L.safeUrl(s.website) === null || /^https?:/.test(L.safeUrl(s.website)), "safeUrl let through a non-web link");
    L.trueYearlyCost(s); L.startUpCosts(s); L.unpricedCosts(s); L.searchSchools([s], { query: "a b", near: { lat: -29.7, lng: 30.7 } });
  });
  check(L.safeUrl("javascript:alert(1)") === null && L.safeUrl("data:text/html,x") === null && L.safeUrl(" JAVASCRIPT:x") === null, "safeUrl lets dangerous links through");
  check(L.findPlace("x".repeat(100000)) === null, "place search with a huge input failed");
  var t = Date.now(); L.suggestPlace("x".repeat(100), []); check(Date.now() - t < 500, "spelling suggestions are too slow on long input");
  passed++;
} catch (e) {
  fail("The data cleaning code crashed on junk data: " + e.stack.split("\n").slice(0, 2).join(" "));
}

// 9. The website deploy must only publish the app (never tools, notes or old data).
var wf = path.join(root, ".github/workflows/pages.yml");
if (fs.existsSync(wf)) {
  var y = fs.readFileSync(wf, "utf8");
  check(!/cp -r[^\n]*\btools\b/.test(y), "pages.yml: publishes the tools folder");
  check(/permissions:\s*\n\s*contents: read/.test(y), "pages.yml: must only have read access to the code");
  var unpinned = (y.match(/uses:\s*\S+@\S+/g) || []).filter(function (u) { return !/@[0-9a-f]{40}\b/.test(u); });
  check(unpinned.length === 0, "pages.yml: GitHub Actions must be pinned to an exact commit: " + unpinned.join(", "));
}

// 10. The Google Play app (Capacitor). These only run once the android/ folder exists.
var capConfig = ["capacitor.config.json", "capacitor.config.ts", "capacitor.config.js"].filter(function (f) { return fs.existsSync(path.join(root, f)); })[0];
if (capConfig) {
  var cc = read(capConfig);
  check(!/\burl\s*["']?\s*:/.test(cc), capConfig + ": server.url loads the app from a website. It must load the files inside the app");
  check(!/allowNavigation/.test(cc), capConfig + ": allowNavigation lets the app open other websites inside itself");
  check(!/cleartext\s*["']?\s*:\s*true/.test(cc), capConfig + ": cleartext (http) must stay off");
  check(!/webContentsDebuggingEnabled\s*["']?\s*:\s*true/.test(cc), capConfig + ": debugging must be off in the store app");
  var pkg = fs.existsSync(path.join(root, "package.json")) ? JSON.parse(read("package.json")) : {};
  var deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  Object.keys(deps).forEach(function (d) {
    check(/^\d+\.\d+\.\d+$/.test(deps[d]), "package.json: " + d + " must be pinned to an exact version (no ^ or ~): " + deps[d]);
    check(/^@capacitor\//.test(d), "package.json: " + d + " is a new package. Ask Security first");
  });
  check(fs.existsSync(path.join(root, "package-lock.json")), "package-lock.json must be committed");
}
var manifestPath = "android/app/src/main/AndroidManifest.xml";
if (fs.existsSync(path.join(root, manifestPath))) {
  var am = read(manifestPath);
  var perms = (am.match(/uses-permission[^>]*android:name="([^"]+)"/g) || []).map(function (p) { return p.match(/name="([^"]+)"/)[1]; });
  var ALLOWED_PERMS = ["android.permission.INTERNET", "android.permission.ACCESS_COARSE_LOCATION"];
  perms.forEach(function (p) { check(ALLOWED_PERMS.indexOf(p) !== -1, manifestPath + ": asks for " + p + ". Only coarse location (and internet) are allowed without Security's OK"); });
  check(!/usesCleartextTraffic="true"/.test(am), manifestPath + ": cleartext (http) traffic must be off");
  check(/allowBackup="false"/.test(am), manifestPath + ": set android:allowBackup=\"false\"");
  check(!/android:debuggable="true"/.test(am), manifestPath + ": the app must not be debuggable");
}
var androidFiles = allFiles.filter(function (f) { return /^android\//.test(f); });
androidFiles.filter(function (f) { return /\.(xml|gradle|kts|properties|json)$/.test(f); }).forEach(function (f) {
  var t = read(f);
  SECRET_PATTERNS.forEach(function (p) { check(!p[0].test(t), f + ": looks like a " + p[1]); });
  check(!/storePassword|keyPassword/.test(t) || /System\.getenv|project\.findProperty|keystoreProperties/.test(t), f + ": signing passwords must not be written in the file");
});
var badAndroid = androidFiles.filter(function (f) { return /(key\.properties|local\.properties|google-services\.json|\.aab|\.apk)$/.test(f); });
check(badAndroid.length === 0, "These Android files must never be committed: " + badAndroid.join(", "));

// 12. The plain school pages for Google (school/<id>/index.html, school/index.html, sitemap.xml, robots.txt).
// They are built together with the data. Same strict rules as index.html, and they must match
// the live data exactly: a page left over from old data could show an old price (golden rule).
var pageFiles = allFiles.filter(function (f) { return /^school\/.*\.html$/.test(f); });
if (pageFiles.length || fs.existsSync(path.join(root, "sitemap.xml"))) {
  var crypto = require("crypto");
  var mainCsp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  pageFiles.forEach(function (f) {
    var p = read(f);
    var c = (p.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
    check(!!c && c === mainCsp, f + ": must have the same Content-Security-Policy as index.html");
    var scripts = p.match(/<script\b[^>]*>/g) || [];
    check(scripts.every(function (s) { return s === '<script src="/js/count.js">'; }), f + ": only <script src=\"/js/count.js\"> is allowed on these pages");
    check(!/<script\b[^>]*>[^<]+<\/script>/.test(p), f + ": has an inline script");
    var loads = p.match(/<(script|link|img|iframe|object|embed|source|video|audio|frame)\b[^>]*\s(src|href)="(https?:)?\/\/[^"]*"/gi) || [];
    check(loads.every(function (l) { return /^<link rel="canonical" href="https:\/\/schoolmap\.co\.za\//.test(l) || /^<link itemprop="url" href="https:\/\/schoolmap\.co\.za\//.test(l); }), f + ": loads something from another website: " + loads.join(" "));
    check(!/<(iframe|object|embed|form|base|frame)\b/i.test(p), f + ": has an iframe, object, embed, form or base tag");
    check(!/\son\w+\s*=/i.test(p), f + ": has an inline event handler");
    check(!/javascript:|vbscript:|data:text/i.test(p), f + ": has a dangerous link");
    (p.match(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g) || []).forEach(function (a) {
      check(/rel="noopener noreferrer"/.test(a), f + ": an outside link is missing rel=\"noopener noreferrer\": " + a.slice(0, 80));
    });
    check(/<meta name="referrer" content="(strict-origin-when-cross-origin|no-referrer)">/.test(p), f + ": referrer policy missing");
    check(/<link rel="canonical" href="https:\/\/schoolmap\.co\.za\/school\//.test(p), f + ": canonical link missing");
  });
  // Every live school has a page, every page is a live school, and each page was built from today's data and cost maths.
  var maths = read("js/logic.js") + read("js/admissions.js");
  var liveIds = {}, sitemap = fs.existsSync(path.join(root, "sitemap.xml")) ? read("sitemap.xml") : "";
  (index.areas || []).forEach(function (a) {
    (a.tiles || []).map(function (t) { return JSON.parse(read("data/" + tilePath(a, t))); }).reduce(function (x, y) { return x.concat(y); }, []).forEach(function (raw) {
      liveIds[raw.id] = true;
      var pf = "school/" + raw.id + "/index.html";
      if (!fs.existsSync(path.join(root, pf))) { fail(pf + ": missing. Rebuild the school pages"); return; }
      var want = crypto.createHash("sha256").update(JSON.stringify(raw) + "\n" + maths).digest("hex").slice(0, 32);
      var got = (read(pf).match(/<meta name="schoolmap-data" content="([0-9a-f]+)">/) || [])[1];
      check(got === want, pf + ": out of date (the data or the cost maths changed). Rebuild the school pages");
      check(sitemap.indexOf("<loc>https://schoolmap.co.za/school/" + raw.id + "/</loc>") !== -1, "sitemap.xml: missing " + raw.id);
    });
  });
  pageFiles.forEach(function (f) {
    var m = /^school\/([^\/]+)\/index\.html$/.exec(f);
    if (m) check(!!liveIds[m[1]], f + ": not a live school (removed, or not verified). It must not be published");
    else check(f === "school/index.html", f + ": unexpected file in school/");
  });
  (sitemap.match(/<loc>[^<]*<\/loc>/g) || []).forEach(function (l) {
    var m = /^<loc>https:\/\/schoolmap\.co\.za\/(?:school\/(?:([a-z0-9-]+)\/)?)?<\/loc>$/.exec(l);
    check(!!m && (!m[1] || !!liveIds[m[1]]), "sitemap.xml: lists something that isn't a live page: " + l);
  });
  check(fs.existsSync(path.join(root, "robots.txt")) && /^Sitemap: https:\/\/schoolmap\.co\.za\/sitemap\.xml$/m.test(read("robots.txt")) && !/^Disallow:\s*\/\s*$/m.test(read("robots.txt")), "robots.txt: must exist, point at the sitemap and not block the site");
  if (fs.existsSync(wf)) check(/cp -r[^\n]*\bschool\b[^\n]*\bsitemap\.xml\b[^\n]*\brobots\.txt\b/.test(fs.readFileSync(wf, "utf8")), "pages.yml: must publish school/, sitemap.xml and robots.txt");
}

// 11. Private stuff never goes in the public repo (bot, raw research, unchecked prices, data-building tools).
var PRIVATE_ONLY = allFiles.filter(function (f) {
  return /^(bot|raw|waiting|verified|downloads|cache)\//.test(f) || /\.pdf$/i.test(f) ||
    /^tools\//.test(f) && f !== "tools/security-check.js";
});
check(PRIVATE_ONLY.length === 0, "These must not be in the public site: " + PRIVATE_ONLY.join(", "));

// 13. Public data holds only what the app shows. The exact quotes behind each number (any field named "evidence"
// or ending in "Evidence", at any depth) and the "sample" flag are kept out, so they can't come back by accident.
var dataFiles = allFiles.filter(function (f) { return /^data\/.*\.json$/.test(f); });
dataFiles.forEach(function (f) {
  var bad = {};
  (function scan(v, where) {
    if (Array.isArray(v)) v.forEach(function (x, i) { scan(x, where + "[" + i + "]"); });
    else if (v && typeof v === "object") Object.keys(v).forEach(function (k) {
      if (/(^e|E)vidence$/.test(k) || k === "sample") bad[k] = true;
      scan(v[k], where + "." + k);
    });
  })(JSON.parse(read(f)), "");
  check(Object.keys(bad).length === 0, f + ": has fields that must not be public: " + Object.keys(bad).join(", ") + ". Rebuild the data");
});

// 14. Test schools (ids starting "zz-", used only to test the fee bot) must never be in the public data.
allFiles.filter(function (f) { return /^data\/schools\/.*\.json$/.test(f); }).forEach(function (f) {
  var ids = JSON.parse(read(f)).map(function (s) { return s && s.id; }).filter(function (id) { return /^zz-/.test(String(id)); });
  check(ids.length === 0, f + ": test schools must never be public: " + ids.join(", "));
});

// 15. The search files and the id lookup must match the tiles exactly (an old entry could show an old fee in the
// list, or send a shared link to the wrong place). Recomputed here with the app's own function.
(function () {
  var wantLookup = {}, ok = true;
  (index.areas || []).forEach(function (a) {
    var want = [];
    (a.tiles || []).forEach(function (t) {
      L.cleanSchools(JSON.parse(read("data/" + tilePath(a, t)))).forEach(function (s) {
        want.push(L.searchEntry(s, t));
        var b = L.lookupBucket(s.id);
        (wantLookup[b] = wantLookup[b] || {})[s.id] = [a.id, t];
      });
    });
    var sortById = function (x, y) { return x.id < y.id ? -1 : 1; };
    var got = a.search && fs.existsSync(path.join(root, "data", a.search)) ? JSON.parse(read("data/" + a.search)) : null;
    check(Array.isArray(got) && JSON.stringify(got.slice().sort(sortById)) === JSON.stringify(want.sort(sortById)), "data/" + a.search + ": doesn't match the school tiles. Rebuild the data");
  });
  var lookupFiles = allFiles.filter(function (f) { return /^data\/lookup\//.test(f); });
  lookupFiles.forEach(function (f) {
    var m = /^data\/lookup\/(\d\d)\.json$/.exec(f);
    check(!!m && Number(m[1]) < 64 && JSON.stringify(JSON.parse(read(f))) === JSON.stringify(wantLookup[m[1]] || {}), f + ": doesn't match the school tiles. Rebuild the data");
  });
  for (var bn = 0; bn < 64; bn++) {
    var bk = (bn < 10 ? "0" : "") + bn;
    check(lookupFiles.indexOf("data/lookup/" + bk + ".json") !== -1, "data/lookup/" + bk + ".json: missing (all 64 must exist). Rebuild the data");
  }
})();

if (failures.length) {
  console.error("\nSECURITY CHECK FAILED (" + failures.length + " problem" + (failures.length === 1 ? "" : "s") + "):\n");
  failures.forEach(function (f) { console.error("  ✗ " + f); });
  console.error("\nFix these before releasing.\n");
  process.exit(1);
}
console.log("Security check passed (" + passed + " checks).");
