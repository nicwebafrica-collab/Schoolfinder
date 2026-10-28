// app.js — draws the screens. All school data is put on the page with textContent
// (never innerHTML), so text copied from school websites can never run as code.

(function () {
  var L = window.SchoolLogic;
  var app = document.getElementById("app");
  var nav = document.getElementById("nav");
  var topbar = document.getElementById("topbar");
  var schools = [];

  // Everything the parent has chosen. Location lives only in memory (never saved or sent).
  var state = { radius: 5, view: "list", place: undefined, showFilters: false, query: "", type: "", phase: "", under3000: false, near: null, grade: {}, costView: "year", compareA: "", compareB: "" };

  // ---------- Small helpers ----------

  // el("p", {className: "x"}, "text", childNode, [more, children])
  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "aria") {
        Object.keys(props.aria).forEach(function (a) { node.setAttribute("aria-" + a, props.aria[a]); });
      } else if (k === "css") {
        Object.keys(props.css).forEach(function (c) { node.style[c] = props.css[c]; });
      } else {
        node[k] = props[k];
      }
    });
    for (var i = 2; i < arguments.length; i++) addChild(node, arguments[i]);
    return node;
  }
  function addChild(node, child) {
    if (child == null || child === false || child === "") return;
    if (Array.isArray(child)) { child.forEach(function (c) { addChild(node, c); }); return; }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  // Simple stroke icons (Lucide style), drawn as SVG so no icon font or emoji is needed.
  var ICONS = {
    search: ["circle:11,11,8", "M21 21l-4.3-4.3"],
    pin: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "circle:12,10,3"],
    bookmark: ["M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"],
    compare: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M12 3v18"],
    back: ["M15 18l-6-6 6-6"],
    chevron: ["M9 18l6-6-6-6"],
    alert: ["circle:12,12,10", "M12 8v4", "M12 16h.01"],
    locate: ["circle:12,12,3", "M12 2v3", "M12 19v3", "M2 12h3", "M19 12h3"],
    phone: ["M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"],
    close: ["M18 6L6 18", "M6 6l12 12"],
    share: ["M12 3v12", "M8 7l4-4 4 4", "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"]
  };
  function icon(name) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    ICONS[name].forEach(function (d) {
      var shape;
      if (d.indexOf("circle:") === 0) {
        var c = d.slice(7).split(",");
        shape = document.createElementNS(NS, "circle");
        shape.setAttribute("cx", c[0]); shape.setAttribute("cy", c[1]); shape.setAttribute("r", c[2]);
      } else {
        shape = document.createElementNS(NS, "path");
        shape.setAttribute("d", d);
      }
      svg.appendChild(shape);
    });
    return svg;
  }

  function unknown(text) { return el("span", { className: "unknown" }, text || L.UNKNOWN); }
  function money(amount) { return L.isNum(amount) ? L.formatRand(amount) : unknown(); }

  function link(url, text) {
    var safe = L.safeUrl(url);
    if (!safe) return unknown();
    return el("a", { href: safe, target: "_blank", rel: "noopener noreferrer" }, text || new URL(safe).hostname.replace(/^www\./, ""));
  }

  function initials(name) {
    return String(name || "?").replace(/\(.*?\)/g, "").split(/\s+/)
      .filter(function (w) { return /^[A-Za-z]/.test(w) && !/^(of|the|and|for)$/i.test(w); })
      .slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("") || "?";
  }

  function findSchool(id) { return schools.filter(function (s) { return s.id === id; })[0]; }
  function gradeFor(s) { return state.grade[s.id] || ""; }
  function schoolHref(s, rest) { return "#/school/" + encodeURIComponent(s.id) + (rest || ""); }

  function replace(children, opts) {
    opts = opts || {};
    app.textContent = "";
    app.className = (opts.wide ? "wide " : "") + (opts.twoPane ? "two-pane " : "") + (opts.sticky ? "has-sticky" : "");
    addChild(app, children);
    drawNav(opts.tab);
    nav.hidden = !!opts.hideNav;
    var old = document.querySelector(".sticky-actions");
    if (old) old.remove();
    if (opts.sticky) document.body.appendChild(opts.sticky);
  }

  // ---------- Saved schools (only school ids, kept on this device) ----------

  function getSaved() {
    try {
      var list = JSON.parse(localStorage.getItem("savedSchools") || "[]");
      return Array.isArray(list) ? list.filter(function (id) { return typeof id === "string"; }) : [];
    } catch (e) { return []; }
  }
  function toggleSaved(id) {
    var saved = getSaved();
    var i = saved.indexOf(id);
    if (i === -1) saved.push(id); else saved.splice(i, 1);
    try { localStorage.setItem("savedSchools", JSON.stringify(saved.slice(0, 50))); } catch (e) { /* private mode: just don't save */ }
    return i === -1;
  }

  // ---------- Location (rounded to about 1 km, memory only) ----------

  function askLocation(button, done) {
    if (!navigator.geolocation) { button.textContent = "Location not supported, type your suburb instead"; return; }
    button.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.near = { lat: Math.round(pos.coords.latitude * 100) / 100, lng: Math.round(pos.coords.longitude * 100) / 100 };
      done();
    }, function () {
      button.textContent = "Couldn't get your location. Type your suburb instead.";
    }, { maximumAge: 600000, timeout: 10000 });
  }

  function distanceTo(s) {
    if (!state.near || typeof s.lat !== "number" || typeof s.lng !== "number") return null;
    return L.distanceKm(state.near.lat, state.near.lng, s.lat, s.lng);
  }

  // ---------- Bottom nav (phones) and top bar (700px and wider) ----------
  // Both are drawn every time; styles.css shows the bottom nav on phones and the top bar on bigger screens.

  var TABS = [["search", "#/", "Search", "search"], ["saved", "#/saved", "Saved", "bookmark"], ["compare", "#/compare", "Compare", "compare"]];

  function drawNav(tab) {
    nav.textContent = "";
    TABS.forEach(function (t) {
      var a = el("a", { href: t[1] }, icon(t[3]), t[2]);
      if (tab === t[0]) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
    topbar.textContent = "";
    var links = el("nav", { className: "top-links", aria: { label: "Main" } }, TABS.map(function (t) {
      var a = el("a", { href: t[1] }, t[2]);
      if (tab === t[0]) a.setAttribute("aria-current", "page");
      return a;
    }));
    topbar.appendChild(el("div", { className: "top-inner" },
      el("a", { href: "#/", className: "brand" }, icon("pin"), "SchoolMap"), links));
  }

  // True inside the installed app (the Android app, or the website added to the home screen).
  // The website welcome is only for people who arrive in a browser from a link.
  function inApp() {
    if (window.Capacitor) return true;
    try { return window.matchMedia("(display-mode: standalone)").matches; } catch (e) { return false; }
  }

  function welcome() {
    if (inApp()) return [];
    var tiles = [
      ["True cost per year", "Fees plus the extras every child pays, in one number."],
      ["Hidden costs in orange", "Levies, uniforms, camps and outings that aren't in the fee."],
      ["Admission rules", "Who gets in first, closing dates and feeder zones."]
    ];
    return [el("section", { className: "welcome" },
      el("h1", { className: "welcome-title" }, "See what a school really costs before you apply."),
      el("p", { className: "muted welcome-line" }, "Fees, hidden extras, outings and admission rules for schools near you. Free for parents."))].concat(
      [el("div", { className: "feature-tiles" }, tiles.map(function (t) {
        return el("div", { className: "feature-tile" }, el("strong", {}, t[0]), el("p", { className: "muted small" }, t[1]));
      }))]);
  }

  // ---------- "Keep SchoolMap on your phone" tip (Designer ux-v2 section 2; web first, Play paused) ----------
  // Only in a phone browser, never in the installed app, and only after the parent has opened a second school
  // or saved one. "Not now" hides it for 30 days (only that date is stored, Security OK 28 Oct).
  var installPrompt = null, schoolsOpened = {}, tipHidden = false;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; });
  window.addEventListener("appinstalled", function () { tipHidden = true; });

  function tipSnoozed() {
    try {
      var until = Number(localStorage.getItem("homeTipHiddenUntil"));
      return isFinite(until) && until > Date.now() && until < Date.now() + 31 * 864e5;
    } catch (e) { return false; }
  }

  function showTip() {
    if (tipHidden || inApp() || tipSnoozed()) return false;
    try { if (!window.matchMedia("(max-width: 699px)").matches) return false; } catch (e) { return false; }
    return Object.keys(schoolsOpened).length >= 2 || getSaved().length > 0;
  }

  function homeScreenTip() {
    if (!showTip()) return null;
    var iphone = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
    var steps = el("ol", { className: "tip-steps", hidden: true },
      iphone ? [el("li", {}, "Tap the Share button ", icon("share"), " in Safari"), el("li", {}, "Tap \u201cAdd to Home Screen\u201d"), el("li", {}, "Tap \u201cAdd\u201d")]
        : [el("li", {}, "Tap the \u22ee menu"), el("li", {}, "Tap \u201cAdd to Home screen\u201d"), el("li", {}, "Tap \u201cAdd\u201d")]);
    var add = el("button", { type: "button", className: "btn solid" }, "Add to home screen");
    var later = el("button", { type: "button", className: "link-btn" }, "Not now");
    var tip = el("section", { className: "home-tip", aria: { label: "Keep SchoolMap on your phone" } },
      el("div", { className: "tip-head" }, icon("pin"), el("strong", {}, "Keep SchoolMap on your phone")),
      el("p", { className: "small" }, "Add it to your home screen. It opens like an app and works offline."),
      steps, el("div", { className: "tip-actions" }, add, later));
    add.addEventListener("click", function () {
      if (installPrompt) { var p = installPrompt; installPrompt = null; p.prompt(); tip.remove(); }
      else { steps.hidden = !steps.hidden; }
    });
    later.addEventListener("click", function () {
      tipHidden = true;
      tip.remove();
      try { localStorage.setItem("homeTipHiddenUntil", String(Date.now() + 30 * 864e5)); } catch (e) { /* private mode: hidden for this visit */ }
    });
    return tip;
  }

  // ---------- Search screen ----------
  // The parent first picks where they live (a suburb, or their location). Then we load only that
  // province's schools and list them nearest first, within the distance they choose.

  function lastPlace() {
    try { return L.placeByName(localStorage.getItem("lastPlace") || ""); } catch (e) { return null; }
  }
  function setPlace(place) {
    state.place = place;
    state.near = null;
    state.query = place ? place.name : "";
    // Only the suburb name is remembered, never the parent's GPS location.
    try { if (place) localStorage.setItem("lastPlace", place.name + "|" + place.region); else localStorage.removeItem("lastPlace"); } catch (e) { /* private mode */ }
  }

  function renderSearch() {
    if (state.place === undefined) {
      state.place = lastPlace();
      if (state.place) state.query = state.place.name;
    }
    var input = el("input", { type: "search", id: "q", placeholder: "Your suburb, e.g. Waterfall", value: state.query, maxLength: 100, autocomplete: "off" });
    var pinBtn = el("button", { type: "button", className: "in-field-btn", aria: { label: "Use my location" } }, icon("locate"));
    if (state.near) pinBtn.setAttribute("aria-pressed", "true");
    var searchBox = el("div", { className: "search-box" }, icon("pin"),
      el("label", { htmlFor: "q", className: "sr-only" }, "Where do you live?"), input, pinBtn);
    var suggestions = el("div", { className: "suggestions", role: "listbox", aria: { label: "Suggestions" } });
    var results = el("div", {});

    pinBtn.addEventListener("click", function () {
      askLocation(pinBtn, function () { state.place = null; state.query = ""; renderSearch(); });
    });

    function choosePlace(place) { setPlace(place); renderSearch(); }

    function drawSuggestions() {
      suggestions.textContent = "";
      var text = input.value.trim();
      if (!text || (state.place && text === state.place.name)) return;
      L.matchPlaces(text, 6).forEach(function (p) {
        var b = el("button", { type: "button", className: "suggestion", role: "option" }, icon("pin"), p.name, el("span", { className: "muted small" }, " " + (p.note ? p.note + ", " : "") + p.region));
        b.addEventListener("click", function () { choosePlace(p); });
        suggestions.appendChild(b);
      });
      // Schools already loaded whose name matches, so a parent can jump straight to one.
      // Also match the school's area and address, so "Embo" finds schools there even if it isn't a known place yet.
      // Each field on its own, so "hillcrest high" can't match across "…Hillcrest Highbury Road" (B40).
      schools.filter(function (s) {
        return [s.name, s.area, s.address].concat(s.aliases || []).some(function (f) { return L.normalise(f).indexOf(L.normalise(text)) !== -1; });
      }).slice(0, 5).forEach(function (s) {
        suggestions.appendChild(el("a", { className: "suggestion", href: schoolHref(s), role: "option" }, s.name));
      });
      if (!suggestions.firstChild) {
        var guess = L.suggestPlace(text, schools);
        var msg = el("p", { className: "muted small" }, "We don't know “" + text.slice(0, 40) + "” yet. ");
        if (guess) {
          var g = el("button", { type: "button", className: "chip" }, "Did you mean " + guess + "?");
          g.addEventListener("click", function () { var p = L.findPlace(guess); if (p) choosePlace(p); else { input.value = guess; drawSuggestions(); } });
          msg.appendChild(g);
        } else {
          msg.appendChild(document.createTextNode("Try a nearby suburb or town."));
        }
        suggestions.appendChild(msg);
      }
    }

    // Typing something new clears the old list, so schools near Botha's Hill never sit under "Vryburg" (T7).
    function typed() {
      var text = input.value.trim();
      var same = state.place ? text === state.place.name : !text;
      if (!same) { results.textContent = ""; Array.prototype.forEach.call(document.querySelectorAll(".radius, .filters-wrap"), function (n) { n.hidden = true; }); }
      drawSuggestions();
      // Parents also search by school name ("Kearsney"). Load every area once so names can be matched (T8).
      if (text.length >= 3 && !L.matchPlaces(text, 1).length) loadAllAreas().then(function () { if (input.value.trim() === text) drawSuggestions(); });
    }
    input.addEventListener("input", typed);
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var p = L.findPlace(input.value) || L.matchPlaces(input.value, 1)[0];
      if (p) { choosePlace(p); return; }
      typed(); // a school name or unknown place: show the choices
    });

    var first = !state.place && !state.near;
    var hello = first ? welcome() : [];
    var parts = (hello.length ? [hello[0]] : [el("h1", { className: "page-title" }, "Find a school")]).concat([searchBox, suggestions]);

    if (first) {
      // First open: ask where they live instead of listing every school in the country.
      var examples = el("div", { className: "chips" }, L.PLACES.filter(function (p) { return areaForPlace(p); }).slice(0, 6).map(function (p) {
        var b = el("button", { type: "button", className: "chip" }, p.name);
        b.addEventListener("click", function () { choosePlace(p); });
        return b;
      }));
      parts.push(el("section", { className: "panel prompt" },
        el("h2", {}, "Where do you live?"),
        el("p", { className: "muted small" }, "Type your suburb, or tap the location button to see the schools closest to you."),
        examples));
      if (hello[1]) parts.push(hello[1]);
      replace(parts, { tab: "search", wide: true });
      return;
    }

    parts.push(radiusRow(results), filterRow(results), results);
    if (wideScreen()) {
      // Desktop: results on the left, the selected school on the right (Designer responsive-v1 step 3).
      replace([el("div", { className: "list-pane" }, parts), el("section", { className: "detail-pane", aria: { label: "School details" } })],
        { tab: "search", wide: true, twoPane: true });
    } else {
      replace(parts, { tab: "search", wide: true });
    }
    drawResults(results);
  }

  // Desktop browsers (1100px and wider) show results and a school side by side.
  function wideScreen() {
    try { return window.matchMedia("(min-width: 1100px)").matches; } catch (e) { return false; }
  }
  var selectedId = null; // the school shown in the desktop right-hand pane

  function fillPane(pane, s) {
    selectedId = s.id;
    var v = schoolView(s);
    v.sticky.className = "pane-actions"; // Compare + Call sit at the top of the pane, not stuck to the window
    pane.textContent = "";
    addChild(pane, [v.sticky].concat(v.parts));
    pane.scrollTop = 0;
    Array.prototype.forEach.call(document.querySelectorAll(".card[data-id]"), function (c) {
      c.classList.toggle("selected", c.getAttribute("data-id") === s.id);
    });
  }

  function radiusRow(results) {
    var row = el("div", { className: "chips radius", role: "group", aria: { label: "Distance" } });
    L.RADII.forEach(function (km) {
      var chip = el("button", { type: "button", className: "chip" }, (km === L.RADII[0] ? "Within " : "") + km + " km");
      chip.setAttribute("aria-pressed", state.radius === km);
      chip.addEventListener("click", function () {
        state.radius = km;
        Array.prototype.forEach.call(row.children, function (c, i) { c.setAttribute("aria-pressed", L.RADII[i] === km); });
        drawResults(results);
      });
      row.appendChild(chip);
    });
    return row;
  }

  // Primary · High school · Filters (n). "Filters" opens the less-used options.
  function filterRow(results) {
    var wrap = el("div", { className: "filters-wrap" });
    var row = el("div", { className: "chips", role: "group", aria: { label: "Filters" } });
    var more = el("div", { className: "filter-sheet", hidden: !state.showFilters });
    function chip(key, value, label, parent) {
      var c = el("button", { type: "button", className: "chip" }, label);
      c.setAttribute("aria-pressed", state[key] === value);
      c.addEventListener("click", function () {
        state[key] = state[key] === value ? (value === true ? false : "") : value;
        var r = filterRow(results); wrap.replaceWith(r);
        drawResults(results);
      });
      parent.appendChild(c);
    }
    chip("phase", "Primary", "Primary", row);
    chip("phase", "High", "High school", row);
    var count = (state.type ? 1 : 0) + (state.under3000 ? 1 : 0);
    var toggle = el("button", { type: "button", className: "chip" }, "Filters", count ? el("span", { className: "badge" }, String(count)) : null);
    toggle.setAttribute("aria-expanded", !!state.showFilters);
    toggle.addEventListener("click", function () {
      state.showFilters = !state.showFilters;
      more.hidden = !state.showFilters;
      toggle.setAttribute("aria-expanded", state.showFilters);
    });
    row.appendChild(toggle);
    chip("type", "Public", "Public", more);
    chip("type", "Private", "Private", more);
    chip("under3000", true, "Under " + L.formatRand(L.COUNTRY.budgetFilter) + "/mo", more);
    wrap.appendChild(row);
    wrap.appendChild(more);
    return wrap;
  }

  function filtersOk(s) {
    if (state.type && s.type !== state.type) return false;
    if (state.phase && s.phase !== state.phase && s.phase !== "Combined") return false;
    if (state.under3000) { var m = L.monthlyFees(s); if (m === null || m > L.COUNTRY.budgetFilter) return false; }
    return true;
  }

  function drawResults(container) {
    var centre = state.near || state.place;
    var where = state.place ? L.placeLabel(state.place) : "you";
    var areas = state.place ? [areaForPlace(state.place)].filter(Boolean) : areasNear(state.near, 20);
    if (!areas.length) {
      container.textContent = "";
      container.appendChild(el("p", { className: "count" }, "No schools in the app near " + where + " yet."));
      container.appendChild(el("p", { className: "muted small" }, "We're adding areas one at a time. Try Waterfall or Hillcrest in KZN."));
      return;
    }
    container.textContent = "";
    container.appendChild(el("p", { className: "muted small" }, "Loading schools…"));
    Promise.all(areas.map(loadArea)).then(function () {
      var pool = schools.filter(function (s) { return areas.some(function (a) { return a.province === s.province; }) && filtersOk(s); });
      var found = L.schoolsNear(pool, centre, state.radius, state.place ? state.place.name : null);
      // The next distance that actually has more schools (T9), not just the next chip.
      var wider = L.RADII.filter(function (km) {
        return km > state.radius && L.schoolsNear(pool, centre, km, null).near.length > found.near.length;
      })[0];
      var extra = wider ? L.schoolsNear(pool, centre, wider, null).near.length - found.near.length : 0;
      var nearestKm = pool.filter(function (s) { return typeof s.lat === "number" && typeof s.lng === "number"; })
        .map(function (s) { return L.distanceKm(centre.lat, centre.lng, s.lat, s.lng); }).sort(function (a, b) { return a - b; })[0];

      container.textContent = "";
      var tip = homeScreenTip();
      if (tip) container.appendChild(tip);
      container.appendChild(el("p", { className: "count" }, found.near.length
        ? found.near.length + (found.near.length === 1 ? " school" : " schools") + " within " + state.radius + " km of " + where
        : "No schools within " + state.radius + " km of " + where));
      // Same name in another province (Waterfall, KZN vs Waterfall, Midrand): offer the other one (B29).
      if (state.place) L.namesakes(state.place).forEach(function (p) {
        var other = el("button", { type: "button", className: "chip" }, "Looking for " + L.placeLabel(p) + "?");
        other.addEventListener("click", function () { setPlace(p); renderSearch(); });
        container.appendChild(other);
      });
      if (found.near.length) {
        container.appendChild(viewToggle(container));
        if (state.view === "rings") {
          container.appendChild(ringsView(found.near, centre));
          container.appendChild(el("p", { className: "count" }, "Nearest first"));
          container.appendChild(el("div", { className: "card-grid" }, found.near.map(schoolCard)));
        }
        else if (state.view === "chart") container.appendChild(costChart(found.near));
        else container.appendChild(el("div", { className: "card-grid" }, found.near.map(schoolCard)));
      }
      if (!found.near.length && !wider && nearestKm != null) {
        container.appendChild(el("p", { className: "muted small" }, "The nearest school in the app is about " + Math.round(nearestKm) + " km away."));
      }
      if (wider) {
        var widen = el("button", { type: "button", className: "link-btn" }, found.near.length
          ? extra + (extra === 1 ? " more school" : " more schools") + " within " + wider + " km"
          : "Search " + wider + " km");
        widen.addEventListener("click", function () { state.radius = wider; renderSearch(); });
        container.appendChild(widen);
      }
      if (found.unknownLocation.length) {
        container.appendChild(el("p", { className: "count" }, (state.place ? "Also in " + where : "Also nearby") + ", location not published"));
        container.appendChild(state.view === "list" || !found.near.length
          ? el("div", { className: "card-grid" }, found.unknownLocation.map(schoolCard))
          : schoolLinks(found.unknownLocation));
      }
      if (state.place) container.appendChild(el("p", { className: "muted small" }, "Distances are straight-line from the middle of " + state.place.name + "."));
      var pane = document.querySelector(".detail-pane");
      if (pane) {
        var first = found.near.concat(found.unknownLocation)[0];
        var pick = (selectedId && findSchool(selectedId)) || (first && findSchool(first.id));
        if (pick) fillPane(pane, pick);
        else { pane.textContent = ""; pane.appendChild(el("p", { className: "muted" }, "Pick a school on the left to see its costs.")); }
      }
    }, function () {
      container.textContent = "";
      container.appendChild(el("p", {}, "Couldn't load schools for this area. Check your internet connection and try again."));
    });
  }

  // ---------- Phone bottom sheet for the rings and chart (Designer ux-v2 section 1) ----------
  // Tapping a dot on a phone opens a peek sheet; "View school" (or dragging up) shows the full school.
  // Back, Esc, the X, the dimmed area or dragging down closes it. Bigger screens follow the dot's link instead.

  var sheet = null; // { node, backdrop, dot, svg }

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest(".viz a") : null;
    var href = a && a.getAttribute("href");
    if (!href || href.indexOf("#/school/") !== 0) return;
    try { if (window.matchMedia("(min-width: 700px)").matches) return; } catch (err) { return; }
    var s = findSchool(decodeURIComponent(href.slice(9)));
    if (!s) return;
    e.preventDefault();
    // A tap on the invisible tap area stands for the visible dot with the same link.
    var dotEl = a.classList.contains("dot") ? a : document.querySelector('.viz a.dot[href="' + href + '"]') || a;
    openSheet(s, dotEl);
  }, true);

  window.addEventListener("popstate", function () { if (sheet) closeSheet(true); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheet) closeSheet(); });

  function openSheet(s, dotEl) {
    if (sheet) closeSheet(true, true);
    var svg = dotEl && dotEl.closest ? dotEl.closest("svg") : null;
    if (svg) svg.classList.add("has-selection");
    if (dotEl) dotEl.classList.add("selected");
    var backdrop = el("div", { className: "sheet-backdrop" });
    var node = el("div", { className: "sheet", role: "dialog", aria: { modal: "true", labelledby: "sheet-title" } });
    backdrop.addEventListener("click", function () { closeSheet(); });
    document.body.appendChild(backdrop);
    document.body.appendChild(node);
    sheet = { node: node, backdrop: backdrop, dot: dotEl, svg: svg };
    try { history.pushState({ sheet: true }, ""); sheet.pushed = true; } catch (e) { /* not allowed */ }
    drawPeek(s);
    dragToResize(node, s);
  }

  function closeSheet(fromBack, quiet) {
    if (!sheet) return;
    var was = sheet;
    sheet = null;
    was.node.remove(); was.backdrop.remove();
    if (was.svg) was.svg.classList.remove("has-selection");
    if (was.dot) { was.dot.classList.remove("selected"); if (!quiet && was.dot.focus) was.dot.focus(); }
    if (!fromBack && was.pushed) history.back();
  }

  function sheetTitle(s) {
    return el("h2", { id: "sheet-title", className: "sheet-title", tabIndex: -1 }, s.name);
  }

  function drawPeek(s) {
    var node = sheet.node;
    node.className = "sheet";
    node.textContent = "";
    var total = L.trueYearlyCost(s), extras = extrasSummary(s);
    var centre = state.near || state.place;
    var km = centre && typeof s.lat === "number" && typeof s.lng === "number" ? L.distanceKm(centre.lat, centre.lng, s.lat, s.lng) : null;
    var saveBtn = el("button", { type: "button", className: "icon-btn light", aria: { label: "Save school" } }, icon("bookmark"));
    saveBtn.setAttribute("aria-pressed", getSaved().indexOf(s.id) !== -1);
    saveBtn.addEventListener("click", function () { saveBtn.setAttribute("aria-pressed", toggleSaved(s.id)); });
    var view = el("button", { type: "button", className: "btn solid" }, "View school");
    view.addEventListener("click", function () { drawFull(s); });
    addChild(node, [
      el("div", { className: "sheet-handle", aria: { hidden: "true" } }),
      el("div", { className: "card-top" },
        el("div", { className: "initials", aria: { hidden: "true" } }, initials(s.name)),
        el("div", { className: "card-title" }, sheetTitle(s),
          el("div", { className: "muted small" }, [s.type, s.grades, km != null ? km.toFixed(1) + " km" : null].filter(Boolean).join(" \u00b7 ")))),
      el("div", { className: "sheet-cost" }, el("div", { className: "label" }, "True cost / yr"),
        el("strong", {}, L.isNum(total) ? feeText(s, total, "No school fees") : "Fees not published")),
      extras ? el("div", { className: "extras-line one-line" }, icon("alert"), el("span", {}, extras)) : null,
      el("div", { className: "sheet-actions" }, view, saveBtn)
    ]);
    node.querySelector("#sheet-title").focus();
  }

  function drawFull(s) {
    var node = sheet.node;
    node.className = "sheet full";
    node.textContent = "";
    var close = el("button", { type: "button", className: "icon-btn light", aria: { label: "Close" } }, icon("close"));
    close.addEventListener("click", function () { closeSheet(); });
    var v = schoolView(s);
    v.sticky.className = "pane-actions";
    addChild(node, [el("div", { className: "sheet-handle", aria: { hidden: "true" } }),
      el("div", { className: "sheet-bar" }, sheetTitle(s), close),
      el("div", { className: "sheet-body" }, [v.sticky].concat(v.parts))]);
    node.querySelector("#sheet-title").focus();
  }

  // Drag the handle up to see the whole school, or down to close.
  function dragToResize(node, s) {
    var startY = null;
    node.addEventListener("touchstart", function (e) {
      if (!e.target.closest(".sheet-handle, .sheet-bar, .card-top")) return;
      startY = e.touches[0].clientY;
    }, { passive: true });
    node.addEventListener("touchend", function (e) {
      if (startY == null) return;
      var dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (dy < -40 && !node.classList.contains("full")) drawFull(s);
      else if (dy > 60) closeSheet();
    }, { passive: true });
  }

  // ---------- List / Around me / Cost chart (Designer map plan B + C, approved 28 Oct) ----------
  // Plain SVG, no map library or tile server, so it costs nothing and works offline.

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, text) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  function viewToggle(container) {
    var group = el("div", { className: "segmented view-toggle", role: "group", aria: { label: "Show schools as" } });
    [["list", "List"], ["rings", "Around me"], ["chart", "Cost vs distance"]].forEach(function (v) {
      var b = el("button", { type: "button" }, v[1]);
      b.setAttribute("aria-pressed", state.view === v[0]);
      b.addEventListener("click", function () { state.view = v[0]; drawResults(container); });
      group.appendChild(b);
    });
    return group;
  }

  // Short list of links, for schools that can't be drawn (no location, or no checked fees).
  function schoolLinks(list) {
    return el("ul", { className: "school-links" }, list.map(function (s) {
      return el("li", {}, el("a", { href: schoolHref(s) }, s.name));
    }));
  }

  // A school as a tappable dot with its initials; the label says the name and true cost for screen readers.
  function dot(s, x, y, r, extraClass) {
    var total = L.trueYearlyCost(s);
    var a = svgEl("a", { href: schoolHref(s), class: "dot" + (extraClass ? " " + extraClass : "") + (s.id === selectedId ? " selected" : "") });
    a.setAttribute("aria-label", s.name + ", " + (s.distanceKm != null ? s.distanceKm.toFixed(1) + " km, " : "") + (L.isNum(total) ? feeText(s, total, "no school fees") : "fees not published"));
    a.appendChild(svgEl("title", {}, s.name));
    a.appendChild(svgEl("circle", { cx: x, cy: y, r: r }));
    a.appendChild(svgEl("text", { x: x, y: y + 4, "text-anchor": "middle" }, initials(s.name)));
    return a;
  }

  // An invisible circle around a dot so it's easier to tap on a phone (B49). These go in a layer UNDER all the
  // visible dots, so a neighbour's tap area can never cover a dot you can see. Hidden from screen readers and
  // the Tab key (the visible dot is the real link). Set with .style so it beats the stylesheet's circle colours.
  function addHit(layer, x, y, target) {
    var a = svgEl("a", { href: typeof target === "string" ? target : "#", tabindex: "-1", "aria-hidden": "true" });
    if (typeof target === "function") a.addEventListener("click", target);
    var c = svgEl("circle", { cx: x, cy: y, r: 24, class: "hit" });
    c.style.fill = "transparent"; c.style.stroke = "none"; c.style.pointerEvents = "all";
    a.appendChild(c);
    layer.appendChild(a);
  }

  // B: home in the middle, rings at 2/5/10/20 km, schools at their real distance and rough direction (north up).
  // Where many schools share a ring and direction they become one "+N" bubble; tapping it lists them.
  function ringsView(list, centre) {
    var R = 145, C = 170, size = 340;
    var rings = L.RADII.filter(function (km) { return km <= state.radius; });
    var max = state.radius;
    var svg = svgEl("svg", { viewBox: "0 0 " + size + " " + size, class: "rings", role: "group", "aria-label": "Schools around " + (state.place ? state.place.name : "you") + ", north is up" });
    // Square-root distance scale (Designer, 28 Oct): the inner rings get more room, where most schools are.
    // Ring labels stay in true km, so the picture is still honest about distance.
    var scale = function (km) { return Math.sqrt(Math.max(km, 0) / max) * R; };
    rings.forEach(function (km) {
      var r = scale(km);
      svg.appendChild(svgEl("circle", { cx: C, cy: C, r: r, class: "ring" }));
      svg.appendChild(svgEl("text", { x: C, y: C + r + 13, "text-anchor": "middle", class: "ring-label" }, km + " km"));
    });
    svg.appendChild(svgEl("text", { x: C, y: 12, "text-anchor": "middle", class: "ring-label" }, "N"));
    var kmPerLng = 111 * Math.cos(centre.lat * Math.PI / 180);
    var points = list.map(function (s) {
      var east = (s.lng - centre.lng) * kmPerLng, north = (s.lat - centre.lat) * 111;
      var d = Math.min(Math.sqrt(east * east + north * north), max);
      var angle = Math.atan2(east, north); // 0 = north, clockwise
      return { s: s, d: d, x: C + Math.sin(angle) * scale(d), y: C - Math.cos(angle) * scale(d) };
    }).sort(function (a, b) { return a.d - b.d; });
    // Only dots that would still overlap on screen (e.g. same campus) join one "+N" bubble (B45, B46).
    var TOUCH = 28; // a little more than two dot radii
    var groups = [];
    points.forEach(function (p) {
      var g = groups.filter(function (g) { return Math.hypot(g.x - p.x, g.y - p.y) < TOUCH; })[0];
      if (!g) { groups.push({ x: p.x, y: p.y, items: [p] }); return; }
      g.items.push(p);
      g.x = g.items.reduce(function (t, i) { return t + i.x; }, 0) / g.items.length;
      g.y = g.items.reduce(function (t, i) { return t + i.y; }, 0) / g.items.length;
    });
    // Keep bubbles and dots off the home dot so its count stays readable.
    groups.forEach(function (g) {
      var dx = g.x - C, dy = g.y - C, len = Math.hypot(dx, dy);
      if (len >= 24) return;
      if (len < 0.5) { dx = 1; dy = 1; len = Math.SQRT2; }
      g.x = C + dx / len * 24; g.y = C + dy / len * 24;
      if (g.items.length === 1) { g.items[0].x = g.x; g.items[0].y = g.y; }
    });
    var extra = el("div", {});
    var hits = svgEl("g", { class: "hits" });
    svg.appendChild(hits);
    groups.forEach(function (gr) {
      var group = gr.items;
      if (group.length <= 3) {
        // 2 or 3 schools at nearly the same spot (e.g. one campus): spread them in a small circle so each
        // stays its own dot. Bigger crowds use the "+N" bubble below.
        group.forEach(function (g, i) {
          var a = group.length === 1 ? 0 : i / group.length * 2 * Math.PI - Math.PI / 2;
          var off = group.length === 1 ? 0 : group.length === 2 ? 14 : 16;
          var x = gr.x + Math.cos(a) * off, y = gr.y + Math.sin(a) * off;
          addHit(hits, x, y, schoolHref(g.s));
          svg.appendChild(dot(g.s, x, y, 13));
        });
        return;
      }
      var x = gr.x, y = gr.y;
      var bubble = svgEl("a", { href: "#", class: "dot bubble", role: "button" });
      bubble.setAttribute("aria-label", group.length + " schools here, show them");
      bubble.appendChild(svgEl("circle", { cx: x, cy: y, r: 16 }));
      bubble.appendChild(svgEl("text", { x: x, y: y + 4, "text-anchor": "middle" }, "+" + group.length));
      var showGroup = function (e) {
        e.preventDefault();
        extra.textContent = "";
        extra.appendChild(el("p", { className: "count" }, group.length + " schools here"));
        extra.appendChild(schoolLinks(group.map(function (g) { return g.s; })));
      };
      bubble.addEventListener("click", showGroup);
      addHit(hits, x, y, showGroup);
      svg.appendChild(bubble);
    });
    svg.appendChild(svgEl("circle", { cx: C, cy: C, r: 6, class: "home" })); // drawn last so schools never hide home
    return el("div", { className: "panel viz" }, svg,
      el("p", { className: "muted small" }, "Blue dot: " + (state.place ? "the middle of " + state.place.name : "you") + ". Straight-line distance, not the road route. Tap a school to open it."),
      extra);
  }

  // C: distance along the bottom, true cost a year up the side. Only schools with checked fees are plotted;
  // the rest are listed underneath, never hidden and never drawn at R0.
  function costChart(list) {
    var W = 340, H = 260, left = 66, right = 22, top = 12, bottom = 40;
    var priced = [], noFee = [], unpriced = [];
    list.forEach(function (s) {
      var t = L.trueYearlyCost(s);
      if (s.noFee && t === 0) noFee.push(s);
      else if (L.isNum(t) && t > 0) priced.push({ s: s, t: t });
      else unpriced.push(s);
    });
    var parts = [];
    if (priced.length) {
      var top$ = Math.max.apply(null, priced.map(function (p) { return p.t; }));
      var step = top$ > 200000 ? 100000 : top$ > 80000 ? 50000 : 20000;
      var yMax = Math.ceil(top$ / step) * step;
      var xMax = state.radius;
      var px = function (km) { return left + km / xMax * (W - left - right); };
      var py = function (r) { return H - bottom - r / yMax * (H - top - bottom); };
      var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "group", "aria-label": "True cost a year against distance from home" });
      // Shaded "closer + cheaper" corner: closer and cheaper than the middle (median) school shown, so one very
      // expensive school can't stretch it to cover almost everything (B47).
      var median = function (arr) { arr = arr.slice().sort(function (a, b) { return a - b; }); var m = arr.length >> 1; return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2; };
      var midT = median(priced.map(function (p) { return p.t; }));
      var midD = Math.min(median(priced.map(function (p) { return p.s.distanceKm || 0; })), xMax);
      svg.appendChild(svgEl("rect", { x: px(0), y: py(midT), width: Math.max(px(midD) - px(0), 0), height: py(0) - py(midT), class: "sweet" }));
      svg.appendChild(svgEl("text", { x: px(0) + 6, y: py(0) - 8, class: "sweet-label" }, "Closer + cheaper"));
      for (var r = 0; r <= yMax; r += step) {
        svg.appendChild(svgEl("line", { x1: left, x2: W - right, y1: py(r), y2: py(r), class: "grid" }));
        svg.appendChild(svgEl("text", { x: left - 6, y: py(r) + 4, "text-anchor": "end", class: "tick" }, r === 0 ? "R0" : "R" + Math.round(r / 1000) + "k"));
      }
      var lastTick = -Infinity;
      [0].concat(L.RADII.filter(function (km) { return km <= xMax; })).forEach(function (km) {
        if (px(km) - lastTick < 34) return; // too close to the last label ("0 km2 km" at 20 km, B48)
        lastTick = px(km);
        svg.appendChild(svgEl("text", { x: px(km), y: H - bottom + 16, "text-anchor": "middle", class: "tick" }, km + " km"));
      });
      svg.appendChild(svgEl("text", { x: (left + W - right) / 2, y: H - 4, "text-anchor": "middle", class: "axis" }, "Distance from home"));
      svg.appendChild(svgEl("text", { x: 12, y: (top + H - bottom) / 2, "text-anchor": "middle", class: "axis", transform: "rotate(-90 12 " + (top + H - bottom) / 2 + ")" }, "True cost a year"));
      var hits = svgEl("g", { class: "hits" });
      svg.appendChild(hits);
      priced.forEach(function (p) {
        var x = px(Math.min(p.s.distanceKm, xMax)), y = py(p.t);
        addHit(hits, x, y, schoolHref(p.s));
        svg.appendChild(dot(p.s, x, y, 11));
      });
      parts.push(svg);
    } else {
      parts.push(el("p", { className: "muted" }, "None of these schools publish fees yet, so there's nothing to plot."));
    }
    if (noFee.length) parts.push(el("p", { className: "count" }, "No fees: " + noFee.length + (noFee.length === 1 ? " school" : " schools")), schoolLinks(noFee));
    if (unpriced.length) parts.push(el("p", { className: "count" }, unpriced.length + (unpriced.length === 1 ? " school" : " schools") + " not shown: fees not published"), schoolLinks(unpriced));
    parts.push(el("p", { className: "muted small" }, "True cost = fees plus extras every child pays. Tap a dot to open the school."));
    return el("div", { className: "panel viz" }, parts);
  }

  // One short orange line for the card: "R1,020 extras not on fee sheet · 3 unpriced".
  function extrasSummary(s) {
    var extras = L.yearlyExtras(s);
    var unpriced = L.unpricedCosts(s).length;
    if (extras > 0) return L.formatRand(extras) + " extras not on fee sheet" + (unpriced ? " · " + unpriced + " unpriced" : "");
    if (unpriced) return unpriced + (unpriced === 1 ? " extra cost" : " extra costs") + " not priced";
    return null;
  }

  function schoolCard(s) {
    var sub = [s.noFee ? "No-fee school" : null, s.type, s.grades, s.language].filter(Boolean).join(" · ");
    var place = [s.area, s.city].filter(Boolean).join(", ");
    var unplaced = (state.near || state.place) && typeof s.lat !== "number";
    var extras = extrasSummary(s);
    var monthly = L.monthlyFees(s), total = L.trueYearlyCost(s);

    var card = el("a", { className: "card", href: schoolHref(s) },
      el("div", { className: "card-top" },
        el("div", { className: "initials", aria: { hidden: "true" } }, initials(s.name)),
        el("div", { className: "card-title" }, el("h3", {}, s.name), el("div", { className: "muted small" }, sub),
          el("div", { className: "muted small" }, place + (unplaced ? " · location not published" : ""))),
        s.distanceKm != null ? el("span", { className: "distance" }, s.distanceKm.toFixed(1) + " km") : null),
      // Unknown fees: one short muted line instead of two big boxes saying "not published".
      monthly === null && total === null
        ? el("p", { className: "unknown card-unknown" }, "Fees not published yet")
        : el("div", { className: "money-pair" },
            el("div", { className: "money" }, el("div", { className: "label" }, "Fees / month"), el("strong", {}, feeText(s, monthly, "No fees"))),
            el("div", { className: "money true" }, el("div", { className: "label" }, "True cost / yr"), el("strong", {}, feeText(s, total, "Extras only")))),
      extras && el("div", { className: "extras-line one-line" }, icon("alert"), el("span", {}, extras)));
    card.setAttribute("data-id", s.id);
    return card;
  }

  // ---------- School profile ----------

  function renderSchool(id) {
    var s = findSchool(id);
    if (!s) return notFound();
    schoolsOpened[s.id] = true;
    if (wideScreen() && (state.place || state.near)) {
      // Desktop with a search open: show the school in the right-hand pane, keeping the list (and its scroll).
      var pane = document.querySelector(".detail-pane");
      if (pane) fillPane(pane, s); else { selectedId = s.id; renderSearch(); }
      return;
    }
    var v = schoolView(s);
    replace(v.parts, { sticky: v.sticky, tab: "search", hideNav: true });
    window.scrollTo(0, 0);
  }

  // The school page's sections and its Compare/Call bar. Used for the phone page and the desktop pane.
  function schoolView(s) {
    var f = s.fees || {};
    var grade = gradeFor(s);
    var fees = L.yearlyFees(s, grade);
    var extras = L.yearlyExtras(s, grade);
    var total = L.trueYearlyCost(s, grade);
    var unpriced = L.unpricedCosts(s);
    var maybe = L.mightAlsoApply(s, grade).filter(function (c) { return !c.included; });
    var dist = distanceTo(s);
    var hiddenCount = (s.hiddenCosts || []).length;

    var saveBtn = el("button", { type: "button", className: "icon-btn", aria: { label: "Save school" } }, icon("bookmark"));
    saveBtn.setAttribute("aria-pressed", getSaved().indexOf(s.id) !== -1);
    saveBtn.addEventListener("click", function () { saveBtn.setAttribute("aria-pressed", toggleSaved(s.id)); });

    var head = el("div", { className: "profile-head" },
      el("div", { className: "head-bar" },
        el("a", { href: "#/", className: "icon-btn", aria: { label: "Back to search" } }, icon("back")), saveBtn),
      el("div", { className: "initials" }, initials(s.name)),
      el("h1", {}, s.name),
      el("div", { className: "sub one-line" }, [s.address || [s.area, s.city].filter(Boolean).join(", "), dist != null ? dist.toFixed(1) + " km from you" : ""].filter(Boolean).join(" · ")),
      el("div", { className: "pills" }, [s.noFee ? "No-fee school" : null, s.type, s.phase, s.grades, s.language].filter(Boolean).map(function (t) { return el("span", { className: "pill" }, t); })));

    // The orange part of the bar is at least 4% wide, so extras are always visible.
    var feePct = total ? Math.min(96, Math.round((fees / total) * 100)) : 100;
    if (extras <= 0) feePct = 100;
    var extrasBits = [extras > 0 ? "Extras " + L.formatRand(extras) : null,
      unpriced.length ? unpriced.length + (unpriced.length === 1 ? " cost" : " costs") + " not priced" : null].filter(Boolean);
    var trueCard = el("section", { className: "panel" },
      el("div", { className: "label" }, "True cost per year" + (f.year ? " · " + f.year + " fees" : " · fee year unknown") + (grade ? " · " + grade : " · entry grade")),
      el("div", { className: "big-money" }, feeText(s, total, "No school fees")),
      noFeeLine(s),
      total ? el("div", { className: "bar", aria: { hidden: "true" } },
        el("div", { className: "fees", css: { width: feePct + "%" } }), el("div", { className: "extra", css: { width: (100 - feePct) + "%" } })) : null,
      // One orange line, linking to the full breakdown (where "might also apply" costs and grade choice live).
      el("a", { className: "extras-line extras-link", href: schoolHref(s, "/costs") }, icon("alert"),
        el("span", {}, (extrasBits.length ? extrasBits.join(" + ") : "No priced extras") + " · See breakdown")),
      f.unofficial ? el("div", { className: "extras-line" }, icon("alert"), f.sourceNote || "These fees are not from the school itself. Confirm them with the school.") : null,
      f.year && f.year < new Date().getFullYear() ? el("div", { className: "extras-line" }, icon("alert"), "These are " + f.year + " fees and may be out of date.") : null);

    var payments = L.instalments(s, grade);
    var facts = el("div", { className: "facts" },
      el("div", { className: "fact" }, el("div", { className: "label" }, "Monthly fee"), el("strong", {}, money(L.monthlyFees(s, grade))),
        payments ? el("div", { className: "muted small" }, payments + " payments") : null),
      fact("Registration", money(f.registration)),
      fact("Once-off to start", startUpText(s, grade)),
      fact("Aftercare", optionalText(s.aftercare)));

    var rows = el("section", { className: "panel" }, el("ul", { className: "rows" },
      navRow(schoolHref(s, "/costs"), "Fees & hidden costs", hiddenCount ? el("span", { className: "badge" }, hiddenCount + (hiddenCount === 1 ? " extra" : " extras")) : null)));

    // Sections with nothing published share one muted line instead of a card each.
    var missing = [];
    var outings = (s.outings || []).length ? outingsPanel(s) : (missing.push("Outings"), null);
    var sports = (s.sports || []).length
      ? panel("Sports & clubs", el("div", { className: "tags" }, s.sports.map(function (x) { return el("span", { className: "pill light" }, x); })))
      : (missing.push("Sports & clubs"), null);
    var careKnown = s.aftercare || s.transport;
    var care = careKnown ? panel("Aftercare & transport", el("ul", { className: "rows" },
      row("Aftercare", optionalText(s.aftercare)), row("Transport", optionalText(s.transport)))) : (missing.push("Aftercare & transport"), null);

    var parts = [
      head, trueCard, zoneBanner(s, dist), facts, rows,
      outings, care, admissionsPanel(s), sports,
      contactPanel(s),
      missing.length ? el("p", { className: "muted small missing-line" }, "Not published yet: " + missing.join(", ")) : null,
      sourceLine(s)
    ];

    var phoneHref = s.phone ? "tel:" + String(s.phone).replace(/[^\d+]/g, "") : null;
    var contact = phoneHref ? el("a", { className: "btn solid", href: phoneHref }, icon("phone"), "Call school")
      : L.safeUrl(s.website) ? el("a", { className: "btn solid", href: L.safeUrl(s.website), target: "_blank", rel: "noopener noreferrer" }, "Visit website") : null;
    var sticky = el("div", { className: "sticky-actions no-nav" },
      el("a", { className: "btn", href: "#/compare/" + encodeURIComponent(s.id) }, icon("compare"), "Compare"), contact);

    return { parts: parts, sticky: sticky };
  }

  // Call, Email and Website as three equal buttons; the full details sit underneath as selectable text.
  function contactPanel(s) {
    var web = L.safeUrl(s.website);
    var email = s.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.email) ? s.email : null;
    var buttons = el("div", { className: "contact-buttons" },
      s.phone ? el("a", { className: "btn", href: "tel:" + String(s.phone).replace(/[^\d+]/g, "") }, icon("phone"), "Call") : null,
      email ? el("a", { className: "btn", href: "mailto:" + email }, "Email") : null,
      web ? el("a", { className: "btn", href: web, target: "_blank", rel: "noopener noreferrer" }, "Website") : null);
    if (!buttons.firstChild) return null;
    return panel("Contact", buttons,
      el("p", { className: "muted small contact-text" }, [s.phone, email, s.address].filter(Boolean).join(" · ")));
  }

  // The teal "feeder zone" banner. Any distance is worked out on this device only.
  function zoneBanner(s, dist) {
    var a = s.admissions || {};
    var zone = a.feederZone || {};
    var pub = (s.provinceRules || {}).publicRules;
    var priv = (s.provinceRules || {}).privateRules;
    var lines = [], title, guide = null, btn = null, cantCheck = null;
    var privacyNote = "Your location is rounded to about 1 km, used only on this phone, and never saved.";

    function locateButton(label) {
      var b = el("button", { type: "button", className: "btn" }, icon("locate"), label);
      b.addEventListener("click", function () { askLocation(b, function () { renderSchool(s.id); }); });
      return b;
    }

    if (zone.kind === "private" || (s.type === "Private" && !zone.kind)) {
      title = "Admission rules";
      lines.push((priv && priv.short) || zone.description);
    } else if (zone.kind === "nearestSchool") {
      title = "Feeder zone: nearest-school rule";
      lines.push((pub && pub.howFarShort) || zone.description);
      var check = L.nearestPublicCheck(schools, s, state.near);
      if (check) {
        var level = s.phase === "High" ? "high school" : s.phase === "Primary" ? "primary" : "school";
        guide = check.tooClose ? "Rough guide: two public " + level + "s are about the same distance from you. Ask the school."
          : check.isNearest ? "Rough guide: looks like your nearest public " + level + "."
          : "Rough guide: another public " + level + " looks closer to you: " + check.nearest.name + ".";
      } else if (L.nearestPublicCheck(schools, s, { lat: s.lat, lng: s.lng }) === null) {
        // Not enough nearby public schools with locations in the app to compare, so don't offer a button that can't answer.
        if (s.type === "Public") cantCheck = "We can't check yet whether this is your nearest public school: not enough nearby public schools with locations are in the app.";
      } else if (!state.near && s.type === "Public" && typeof s.lat === "number") {
        btn = locateButton("Is this my nearest school?");
      }
    } else if (zone.kind === "radius" && L.isNum(zone.radiusKm) && typeof s.lat === "number" && typeof s.lng === "number") {
      if (dist != null) {
        // The location is rounded (up to ~0.8 km off), so near the edge we can't give a firm answer.
        title = Math.abs(dist - zone.radiusKm) <= 1 ? "Close to the feeder zone edge (about " + dist.toFixed(1) + " km). Check with the school."
          : dist < zone.radiusKm ? "You live in this school's feeder zone" : "Outside the feeder zone · " + dist.toFixed(1) + " km";
      } else {
        title = "Feeder zone: within " + zone.radiusKm + " km of the school";
        btn = locateButton("Am I in the zone?");
      }
      lines.push(zone.description);
    } else if (zone.description || pub) {
      title = zone.kind === "namedSchools" ? "Feeder schools" : "Feeder zone";
      lines.push(zone.description || (pub && pub.howFarShort));
    } else {
      return null;
    }

    if ((zone.feederSchools || []).length) lines.push("Feeder primaries: " + zone.feederSchools.join(", "));

    return el("section", { className: "zone" },
      el("div", { className: "zone-title" }, icon("pin"), title),
      lines.filter(Boolean).map(function (t) { return el("p", { className: "zone-line" }, t); }),
      guide && el("p", { className: "zone-guide" }, guide),
      cantCheck && el("p", { className: "zone-line" }, cantCheck),
      guide && el("p", { className: "zone-line" }, "Straight-line distance among the schools in this app only, not gate to gate."),
      btn, btn && el("p", { className: "zone-line" }, privacyNote));
  }

  // "2026-05-15 (closed)" once the date has passed, so parents don't plan around an old deadline.
  function dateWithStatus(iso) {
    var past = /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso < new Date().toISOString().slice(0, 10);
    return iso + (past ? " (closed)" : "");
  }

  function admissionsPanel(s) {
    var a = s.admissions || {};
    var pr = s.provinceRules || {};
    var pub = pr.publicRules, priv = pr.privateRules;
    if (!s.admissions && !pub && !priv) return panel("Admissions & feeder zone", el("p", { className: "empty" }, L.UNKNOWN));

    function bullets(items) {
      return items && items.length ? el("ul", { className: "bullets" }, items.map(function (t) { return el("li", {}, t); })) : null;
    }
    function sub(title, body) { return body ? [el("h3", { className: "sub-title" }, title), body] : null; }
    var applyLink = a.applyUrl || a.source; // often the same page, so show it once

    var howItWorks = pub ? [
      sub("When to apply (all " + (pr.name || "public") + " public schools)", pub.windowText && el("p", { className: "small" }, pub.windowText)),
      sub("How far can you live?", bullets(pub.howFarDetails)),
      sub("Documents you'll need", bullets(pub.documents)),
      sub("Age rules", bullets(pub.ageRules)),
      sub("Your rights", bullets(pub.yourRights)),
      sub("If you're refused", bullets(pub.ifRefused)),
      pub.warning && el("div", { className: "extras-line" }, icon("alert"), pub.warning),
      el("p", { className: "source" }, (pr.name || "Province") + " rules checked " + (pr.checked || "date unknown") + ". ",
        pub.windowSource ? link(pub.windowSource, "Source") : null)
    ] : priv ? bullets(priv.usualSteps) : null;

    return panel("Admissions & feeder zone",
      bullets((a.rules || []).slice(0, 3)),
      el("ul", { className: "rows" },
        a.applyBy ? row("Apply by", dateWithStatus(a.applyBy))
          : pub && pub.closes ? row((pr.name || "Province") + " closing date", dateWithStatus(pub.closes))
          : row("Apply by", unknown())),
      L.safeUrl(applyLink) ? el("a", { className: "btn apply-btn", href: L.safeUrl(applyLink), target: "_blank", rel: "noopener noreferrer" }, "Apply on school website") : null,
      howItWorks ? el("details", { className: "how-it-works" }, el("summary", {}, "How it works"), howItWorks) : null);
  }

  function outingsPanel(s) {
    var outings = s.outings || [];
    if (!outings.length) return panel("Outings, camps & events", el("p", { className: "empty" }, "No outings published by the school yet."));
    return el("section", { className: "panel hidden-panel" },
      el("h2", {}, "Outings, camps & events", el("span", { className: "badge" }, L.formatRand(L.yearlyOutings(s)) + " a year")),
      el("ul", { className: "rows" }, outings.map(function (o) {
        return el("li", {},
          el("span", { className: "name" }, o.name, el("span", { className: "note" }, [o.grades, o.when, o.note].filter(Boolean).join(" · "))),
          el("span", { className: "amt" + (L.isNum(o.cost) ? "" : " unknown") }, L.isNum(o.cost) ? L.formatRand(o.cost) : L.UNKNOWN));
      })));
  }

  // Grade chips on the costs screen, when fees differ by grade. "Entry grade" is the default.
  function gradeChips(s, grade, redraw) {
    var byGrade = (s.fees || {}).byGrade || [];
    if (!byGrade.length) return null;
    var row = el("div", { className: "chips grade-chips", role: "group", aria: { label: "Fees for grade" } });
    [{ grade: "" }].concat(byGrade).forEach(function (g) {
      var c = el("button", { type: "button", className: "chip" }, g.grade || "Entry grade");
      c.setAttribute("aria-pressed", (g.grade || "") === (grade || ""));
      c.addEventListener("click", function () { state.grade[s.id] = g.grade; redraw(); });
      row.appendChild(c);
    });
    return row;
  }

  // ---------- True cost breakdown ----------

  function renderCosts(id) {
    var s = findSchool(id);
    if (!s) return notFound();
    var f = s.fees || {};
    var grade = gradeFor(s);
    var div = state.costView === "month" ? 12 : 1;
    function per(n) { return L.isNum(n) ? n / div : null; }
    var extras = L.yearlyExtras(s, grade);
    var payments = L.instalments(s, grade);

    var toggle = el("div", { className: "segmented", role: "group", aria: { label: "Show costs" } });
    [["month", "Per month"], ["year", "Per year"]].forEach(function (o) {
      var b = el("button", { type: "button" }, o[1]);
      b.setAttribute("aria-pressed", state.costView === o[0]);
      b.addEventListener("click", function () { state.costView = o[0]; renderCosts(id); });
      toggle.appendChild(b);
    });

    // One hidden cost as a row. "Counted" rows show what they add to the total; the others show the school's price.
    function costRow(c, counted) {
      var priced = L.isNum(c.amount);
      var yearly = L.perYear(c);
      var shown = !priced ? null
        : c.per ? L.formatRand(c.amount) + " per " + c.per
        : c.frequency === "once" ? L.formatRand(c.amount) + " once"
        : counted && yearly !== null ? L.formatRand(yearly / div)
        : L.formatRand(c.amount) + " " + c.frequency;
      var how = priced ? L.formatRand(c.amount) + " " + (c.per ? "per " + c.per : c.frequency || "") : c.frequency;
      var noteParts = [counted ? how : L.appliesLabel(c), c.priceFor ? c.priceFor + " price, other grades may differ" : null, c.note, c.problem ? "Data problem: " + c.problem : null];
      return el("li", {},
        el("span", { className: "name" }, c.item, el("span", { className: "note" }, noteParts.filter(Boolean).join(" · "))),
        el("span", { className: "amt" + (shown ? "" : " unknown") }, shown || L.UNKNOWN));
    }
    var hidden = (s.hiddenCosts || []).filter(function (c) { return L.countsInTotal(c, grade); }).map(function (c) { return costRow(c, true); });
    var maybe = L.mightAlsoApply(s, grade).map(function (c) { return costRow(c, false); });

    // B9: the per-month view is an average over 12 months; say so when the school bills over fewer months.
    var monthNote = state.costView === "month" && payments && payments !== 12 && L.isNum(L.monthlyFees(s, grade))
      ? "Average per month over 12 months. School fees are paid in " + payments + " instalments of " + L.formatRand(L.monthlyFees(s, grade)) + "."
      : state.costView === "month" ? "Average per month over 12 months." : null;

    var byGrade = Array.isArray(f.byGrade) && f.byGrade.length
      ? panel("Fees by grade" + (f.year ? " (" + f.year + ")" : ""), el("ul", { className: "rows" }, f.byGrade.map(function (g) {
          return row(g.grade, money(per(L.yearlyFees({ fees: g }))));
        }))) : null;

    replace([
      el("a", { href: schoolHref(s), className: "btn", css: { marginBottom: "12px" } }, icon("back"), "Back to school"),
      el("h1", { className: "screen-title" }, "True cost breakdown"),
      el("p", { className: "muted small" }, s.name + (grade ? " · " + grade : "")),
      toggle,
      gradeChips(s, grade, function () { renderCosts(id); }),
      el("div", { className: "big-money" }, feeText(s, per(L.trueYearlyCost(s, grade)), "No school fees")),
      noFeeLine(s),
      monthNote ? el("p", { className: "muted small" }, monthNote) : null,
      f.unofficial ? el("div", { className: "extras-line" }, icon("alert"), f.sourceNote || "These fees are not from the school itself. Confirm them with the school.") : null,
      extras > 0 ? el("div", { className: "extras-line" }, icon("alert"), "Includes " + L.formatRand(extras / div) + " you would not see on the fee sheet") : null,
      panel("On the fee sheet" + (f.year ? " (" + f.year + ")" : ""), el("ul", { className: "rows" },
        state.costView === "month" && L.isNum(L.monthlyFees(s, grade))
          ? row("School fees" + (payments ? " (" + payments + " payments a year)" : ""), L.formatRand(L.monthlyFees(s, grade)))
          : row("School fees", money(per(L.yearlyFees(s, grade)))),
        row("Registration (once)", money(f.registration)),
        // Hide the empty deposit row when the deposit is listed as a hidden cost instead (B23).
        f.deposit == null && (s.hiddenCosts || []).some(function (c) { return /deposit/i.test(c.item); }) ? null : row("Deposit (once)", money(f.deposit))),
        f.notes ? el("p", { className: "muted small" }, f.notes) : null),
      el("section", { className: "panel hidden-panel" },
        el("h2", { className: "hidden-text" }, icon("alert"), "Hidden costs, not on the fee sheet"),
        hidden.length ? el("ul", { className: "rows" }, hidden) : el("p", { className: "empty" }, "No hidden costs found yet. That doesn't mean there are none.")),
      maybe.length ? el("section", { className: "panel" },
        el("h2", {}, "Might also apply to you"),
        el("p", { className: "muted small" }, "Not in the total above: only some families pay these."),
        el("ul", { className: "rows" }, maybe)) : null,
      byGrade,
      sourceLine(s)
    ], { tab: "search" });
    window.scrollTo(0, 0);
  }

  // ---------- Saved ----------

  function renderSaved() {
    var saved = getSaved().map(findSchool).filter(Boolean);
    replace([
      el("h1", { className: "page-title" }, "Saved schools"),
      saved.length ? el("div", { className: "card-grid" }, saved.map(schoolCard))
        : el("p", { className: "muted" }, "Tap the bookmark on a school's page to save it here. Saved schools stay on this device only.")
    ], { tab: "saved", wide: true });
  }

  // ---------- Compare ----------

  function renderCompare(a, b) {
    if (a) state.compareA = a;
    if (b) state.compareB = b;
    if (state.compareA && state.compareA === state.compareB) state.compareB = "";
    var A = findSchool(state.compareA), B = findSchool(state.compareB);

    // Each picker leaves out the school already chosen in the other one (B15).
    function picker(key, current, label, other) {
      var sel = el("select", { aria: { label: label } },
        el("option", { value: "" }, "Choose a school"),
        schools.slice().sort(function (x, y) { return x.name.localeCompare(y.name); })
          .filter(function (s) { return s.id !== other; })
          .map(function (s) { return el("option", { value: s.id, selected: s.id === current }, s.name); }));
      sel.addEventListener("change", function () {
        state[key] = sel.value;
        if (location.hash === "#/compare") renderCompare(); else location.hash = "#/compare";
      });
      return sel;
    }

    var body;
    if (A && B) {
      var ga = gradeFor(A), gb = gradeFor(B);
      var ta = L.trueYearlyCost(A, ga), tb = L.trueYearlyCost(B, gb);
      var verdict = L.isNum(ta) && L.isNum(tb)
        ? (ta === tb ? "They cost the same per year." : (ta < tb ? A.name : B.name) + " costs " + L.formatRand(Math.abs(ta - tb)) + " less a year.")
        : "We can't compare totals until both schools publish their fees.";
      body = [
        el("section", { className: "compare-total" },
          el("div", { className: "label on-dark" }, "True cost per year"),
          el("div", { className: "two" },
            el("div", {}, el("div", { className: "sub" }, A.name), el("strong", {}, L.isNum(ta) ? L.formatRand(ta) : L.UNKNOWN)),
            el("div", {}, el("div", { className: "sub" }, B.name), el("strong", {}, L.isNum(tb) ? L.formatRand(tb) : L.UNKNOWN))),
          el("div", { className: "verdict" }, verdict)),
        el("section", { className: "panel compare-table" },
          el("div", { className: "crow chead", aria: { hidden: "true" } }, el("div", { className: "label" }, ""),
            el("div", { className: "two" }, el("span", {}, A.name), el("span", {}, B.name))),
          crow("School fees / year", money(L.yearlyFees(A, ga)), money(L.yearlyFees(B, gb))),
          crow("Monthly fee", [money(L.monthlyFees(A, ga)), paymentsText(A, ga)], [money(L.monthlyFees(B, gb)), paymentsText(B, gb)]),
          crow("Extras not on the fee sheet / year", extrasText(A, ga), extrasText(B, gb), true),
          crow("Extras with no published price", String(L.unpricedCosts(A).length), String(L.unpricedCosts(B).length), true),
          crow("Costs that might also apply (not in total)", String(L.mightAlsoApply(A, ga).length), String(L.mightAlsoApply(B, gb).length), true),
          crow("Once-off to start", money(L.startUpCosts(A)), money(L.startUpCosts(B))),
          crow("Aftercare", optionalText(A.aftercare), optionalText(B.aftercare)),
          crow("Transport", optionalText(A.transport), optionalText(B.transport)),
          crow("Type", A.type || unknown(), B.type || unknown()),
          crow("Grades", A.grades || unknown(), B.grades || unknown()),
          crow("Area", [A.area, A.city].filter(Boolean).join(", "), [B.area, B.city].filter(Boolean).join(", ")))
      ];
    } else {
      body = el("p", { className: "muted" }, "Pick two schools to see their true costs side by side.");
    }

    replace([
      el("h1", { className: "page-title" }, "Compare"),
      el("div", { className: "compare-pick" }, picker("compareA", state.compareA, "First school", state.compareB), picker("compareB", state.compareB, "Second school", state.compareA)),
      body
    ], { tab: "compare", wide: true });
  }

  function crow(label, a, b, hidden) {
    return el("div", { className: "crow" + (hidden ? " h" : "") },
      el("div", { className: "label" }, label),
      el("div", { className: "two" }, el("span", {}, a), el("span", {}, b)));
  }

  // ---------- Privacy page (POPIA) ----------

  function renderPrivacy() {
    replace(el("div", { className: "prose" },
      el("h1", { className: "page-title" }, "Privacy"),
      el("p", {}, "You can use SchoolMap without an account. There are no adverts, no cookies and nothing that follows you around the web."),
      el("h2", {}, "Your location"),
      el("p", {}, "If you tap “Use my location” or “Am I in the zone?”, your location is rounded to about 1 km and used only on your device to work out distances. It is never sent to us or saved."),
      el("h2", {}, "Saved on this device"),
      el("p", {}, "Three things are stored in your browser on this device only, and are never sent to us: the schools you bookmark, the name of the last suburb you searched (never your exact location), and, if you tap \u201cNot now\u201d on the home screen tip, the date until which it stays hidden. Clearing your browser data removes them."),
      el("h2", {}, "Counting visits"),
      el("p", {}, "We count how many times each page is opened using GoatCounter, so we know how many parents use SchoolMap. It uses no cookies and doesn't identify you. It records the page, the website that sent you, and the country, and your IP address isn't stored. GoatCounter is hosted outside South Africa. If your browser asks not to be tracked, nothing is counted. ",
        link("https://www.goatcounter.com/help/privacy", "GoatCounter's privacy notes")),
      el("h2", {}, "School information"),
      el("p", {}, "Fees and costs come from each school's public website and fee letters. Every school page shows its sources and the date we checked. Always confirm with the school before making decisions."),
      el("h2", {}, "Our web host"),
      el("p", {}, "The app is hosted on GitHub Pages. Like every web host, GitHub keeps basic access logs (such as your IP address and the time) for security. We don't see these logs or use them to identify you. ",
        link("https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", "GitHub's privacy statement")),
      el("h2", {}, "Your rights"),
      el("p", {}, "We follow South Africa's Protection of Personal Information Act (POPIA). We don't collect personal information ourselves, so there is nothing about you for us to store or delete.")
    ), {});
  }

  // ---------- Shared pieces ----------

  function panel(title) {
    var section = el("section", { className: "panel" }, el("h2", {}, title));
    for (var i = 1; i < arguments.length; i++) addChild(section, arguments[i]);
    return section;
  }
  function row(label, value) { return el("li", {}, el("span", { className: "name" }, label), el("span", { className: "amt" }, value)); }
  function navRow(href, label, extra) {
    return el("li", { className: "link-row" }, el("a", { href: href }, el("span", { className: "name" }, label), el("span", { className: "row-end" }, extra, icon("chevron"))));
  }
  function fact(label, value) { return el("div", { className: "fact" }, el("div", { className: "label" }, label), el("strong", {}, value)); }

  // "Monthly fee (x10)" when the school bills over fewer than 12 months, so parents know it's a real instalment.
  function monthlyLabel(s, grade) {
    var n = L.instalments(s, grade);
    return n ? "Monthly fee (" + n + " payments)" : "Monthly fee (average)";
  }
  function paymentsText(s, grade) {
    var n = L.instalments(s, grade);
    return n && L.isNum(L.monthlyFees(s, grade)) ? " × " + n : "";
  }

  // Start-up cost, or a once-off payment that is already part of the yearly fee (Fourways Gr 8 R7,000).
  function startUpText(s, grade) {
    var start = L.startUpCosts(s);
    if (L.isNum(start)) return L.formatRand(start);
    var inFee = (s.hiddenCosts || []).filter(function (c) {
      return c.included && c.frequency === "once" && L.isNum(c.amount) && (!grade || L.countsInTotal({ applies: c.applies }, grade));
    })[0];
    return inFee ? L.formatRand(inFee.amount) + " (part of the yearly fee)" : unknown();
  }

  // No-fee public schools charge nothing by law, so show words instead of a bare "R0" (B36).
  function feeText(s, amount, words) {
    return s.noFee && amount === 0 ? words : money(amount);
  }
  function noFeeLine(s) {
    if (!s.noFee) return null;
    return el("p", { className: "muted small" }, "No-fee public school" + (s.quintile ? " (quintile " + s.quintile + ")" : "") +
      ": parents pay no school fees by law. Uniform, stationery and trips may still cost something.");
  }

  // Never "R0" when the extras exist but aren't priced (B41).
  function extrasText(s, grade) {
    var x = L.yearlyExtras(s, grade);
    if (x > 0) return L.formatRand(x);
    return L.unpricedCosts(s).length ? unknown("None priced yet") : "None found";
  }

  function optionalText(o) {
    if (!o || o.available === null || o.available === undefined) return unknown();
    if (!o.available) return "Not offered";
    return L.isNum(o.monthly) ? L.formatRand(o.monthly) + "/mo" : unknown("Offered, price not published");
  }

  function sourceLine(s) {
    var links = (s.sources || []).map(function (u, i) { return [i ? ", " : "", link(u)]; });
    return el("p", { className: "source" },
      "From the school's website and fee letter · checked " + (s.lastChecked || "date unknown") + ". ",
      links.length ? ["Sources: ", links, ". "] : "No source links yet. ",
      el("a", { href: "#/privacy" }, "Privacy"));
  }

  function notFound() {
    replace([el("h1", { className: "screen-title" }, "School not found"), el("p", {}, el("a", { href: "#/" }, "Back to search"))], { tab: "search" });
  }

  // ---------- Routing ----------
  // #/  ·  #/school/<id>  ·  #/school/<id>/costs  ·  #/saved  ·  #/compare[/<a>[/<b>]]  ·  #/privacy

  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return ""; }
    });
    if (parts[0] === "school" && parts[2] === "costs") renderCosts(parts[1]);
    else if (parts[0] === "school") renderSchool(parts[1]);
    else if (parts[0] === "saved") renderSaved();
    else if (parts[0] === "compare") renderCompare(parts[1], parts[2]);
    else if (parts[0] === "privacy") renderPrivacy();
    else { selectedId = null; renderSearch(); }
  }

  // Redraw when the window crosses the desktop width, so the layout switches between one and two panes.
  try { window.matchMedia("(min-width: 1100px)").addEventListener("change", function () { route(); }); } catch (e) { /* old browser */ }

  // Install the service worker (sw.js) so the app can be added to the home screen and work offline.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register("sw.js").catch(function () {}); } catch (e) { /* not allowed here */ }
  }

  // Tell parents when they're offline, so they know prices may not be the latest.
  function showOffline() {
    var bar = document.getElementById("offline");
    if (navigator.onLine === false && !bar) {
      document.body.insertBefore(el("div", { id: "offline", className: "offline-bar", role: "status" },
        "You're offline. Showing the school info saved on this phone."), document.body.firstChild);
    } else if (navigator.onLine !== false && bar) {
      bar.remove();
    }
  }
  window.addEventListener("online", showOffline);
  window.addEventListener("offline", showOffline);
  showOffline();

  // ---------- Loading data, one province at a time ----------
  // data/index.json lists the areas (provinces) and their files. A province's schools are only
  // downloaded when the parent searches there or opens one of its schools.

  var index = { areas: [] };
  var loading = {}; // area id -> promise, so each file is fetched once

  // In the single-file preview every data file is embedded in window.EMBEDDED_DATA instead of fetched.
  function getJson(path) {
    if (window.EMBEDDED_DATA && Object.prototype.hasOwnProperty.call(window.EMBEDDED_DATA, path)) {
      return Promise.resolve(window.EMBEDDED_DATA[path]);
    }
    return fetch("data/" + path).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function loadArea(area) {
    if (!loading[area.id]) {
      loading[area.id] = Promise.all([
        getJson(area.file),
        area.rules ? getJson(area.rules).catch(function () { return null; }) : null // rules are optional
      ]).then(function (both) {
        var fresh = L.mergeAdmissions(L.cleanSchools(both[0]), L.cleanAdmissionsFile(both[1]));
        var have = {};
        schools.forEach(function (s) { have[s.id] = true; });
        schools = schools.concat(fresh.filter(function (s) { return !have[s.id]; }));
        var problems = L.dataProblems(fresh);
        if (problems.length && window.console) console.warn("School data problems (shown as unpriced):\n" + problems.join("\n"));
      }, function (err) { delete loading[area.id]; throw err; });
    }
    return loading[area.id];
  }

  function areaForPlace(place) {
    return index.areas.filter(function (a) { return a.short === place.region || a.province === place.region; })[0] || null;
  }

  // Areas whose schools sit within about radiusKm of a point (using each area's map bounds).
  function areasNear(point, radiusKm) {
    var pad = radiusKm / 111; // roughly 111 km per degree of latitude
    var padLng = pad / Math.max(Math.cos(point.lat * Math.PI / 180), 0.2); // longitude degrees shrink away from the equator
    return index.areas.filter(function (a) {
      var b = a.bounds;
      return b && point.lat >= b[0] - pad && point.lat <= b[2] + pad && point.lng >= b[1] - padLng && point.lng <= b[3] + padLng;
    });
  }

  // Every area, once (for searching by school name). Fine while there are a few areas; with many, index.json
  // should carry school names instead.
  function loadAllAreas() {
    return Promise.all(index.areas.map(function (a) { return loadArea(a).catch(function () { return null; }); }));
  }

  // Load whichever areas hold these school ids (for Saved, Compare and shared links).
  function loadSchools(ids) {
    var need = index.areas.filter(function (a) {
      return (a.ids || []).some(function (id) { return ids.indexOf(id) !== -1; });
    });
    return Promise.all(need.map(loadArea));
  }

  function idsInRoute() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return ""; }
    });
    if (parts[0] === "school") return [parts[1]];
    if (parts[0] === "compare") return [parts[1], parts[2], state.compareA, state.compareB].filter(Boolean);
    if (parts[0] === "saved") return getSaved();
    return [];
  }

  // Make sure the schools a screen needs are loaded, then draw it.
  function routeWithData() {
    loadSchools(idsInRoute()).then(route, route);
  }

  function start(idx, country) {
    index = idx && Array.isArray(idx.areas) ? idx : { areas: [] };
    L.setCountry(country);
    window.addEventListener("hashchange", routeWithData);
    routeWithData();
  }

  getJson("index.json").then(function (idx) {
    var code = Object.keys(idx.countries || {})[0];
    var countryFile = code ? getJson(idx.countries[code]).catch(function () { return null; }) : null;
    return Promise.resolve(countryFile).then(function (country) { start(idx, country); });
  }, function () {
    // Only a failed download lands here; a bug while drawing shows up in the console instead.
    replace([el("h1", { className: "screen-title" }, "Can't load schools"),
      el("p", {}, "Check your internet connection and refresh the page.")], {});
  });
})();
