// app.js — draws the screens. All school data is put on the page with textContent
// (never innerHTML), so text copied from school websites can never run as code.

(function () {
  var L = window.SchoolLogic;
  var app = document.getElementById("app");
  var nav = document.getElementById("nav");
  var schools = [];

  // Everything the parent has chosen. Location lives only in memory (never saved or sent).
  var state = { query: "", type: "", phase: "", under3000: false, near: null, grade: {}, costView: "year", compareA: "", compareB: "" };

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
    phone: ["M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"]
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
    app.className = (opts.wide ? "wide " : "") + (opts.sticky ? "has-sticky" : "");
    addChild(app, children);
    drawNav(opts.tab);
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

  // ---------- Bottom nav ----------

  function drawNav(tab) {
    nav.textContent = "";
    [["search", "#/", "Search", "search"], ["saved", "#/saved", "Saved", "bookmark"], ["compare", "#/compare", "Compare", "compare"]]
      .forEach(function (t) {
        var a = el("a", { href: t[1] }, icon(t[3]), t[2]);
        if (tab === t[0]) a.setAttribute("aria-current", "page");
        nav.appendChild(a);
      });
  }

  // ---------- Search screen ----------

  function renderSearch() {
    var input = el("input", { type: "search", id: "q", placeholder: "Suburb, town or postcode", value: state.query, maxLength: 100, autocomplete: "off" });
    var searchBox = el("label", { className: "search-box" }, icon("pin"), el("span", { className: "sr-only" }, "Where are you looking?"), input);
    var results = el("div", {});

    var chips = el("div", { className: "chips", role: "group", aria: { label: "Filters" } });
    var nearBtn = el("button", { type: "button", className: "chip" }, icon("locate"), state.near ? "Sorted by distance" : "Use my location");
    nearBtn.setAttribute("aria-pressed", !!state.near);
    nearBtn.addEventListener("click", function () {
      if (state.near) { state.near = null; renderSearch(); return; }
      askLocation(nearBtn, renderSearch);
    });
    chips.appendChild(nearBtn);

    [["phase", "Primary", "Primary"], ["phase", "High", "High school"], ["type", "Public", "Public"], ["type", "Private", "Private"], ["under3000", true, "Under R3,000/mo"]]
      .forEach(function (c) {
        var key = c[0], value = c[1];
        var chip = el("button", { type: "button", className: "chip" }, c[2]);
        chip.setAttribute("aria-pressed", state[key] === value);
        chip.addEventListener("click", function () {
          state[key] = state[key] === value ? (key === "under3000" ? false : "") : value;
          state.query = input.value;
          renderSearch();
        });
        chips.appendChild(chip);
      });

    var timer;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.query = input.value; drawResults(results); }, 150);
    });

    var notice = schools.some(function (s) { return s.sample; })
      ? el("div", { className: "notice" }, "Preview: these are made-up sample schools until real school data is added.") : null;

    replace([
      el("h1", { className: "page-title" }, "Find a school"),
      el("p", { className: "muted small" }, "See the true cost of each school, including the extras not on the fee sheet."),
      searchBox, chips, notice, results
    ], { tab: "search", wide: true });
    drawResults(results);
  }

  function drawResults(container) {
    var list = L.searchSchools(schools, {
      query: state.query, type: state.type, phase: state.phase,
      maxMonthly: state.under3000 ? 3000 : null, near: state.near
    });
    container.textContent = "";
    if (!list.length) {
      var q = state.query.trim().slice(0, 60);
      container.appendChild(el("p", { className: "count", css: { overflowWrap: "anywhere" } }, "No schools found" + (q ? " for “" + q + "”" : "") + "."));
      container.appendChild(el("p", { className: "muted small" }, "Try a nearby suburb, check the spelling, or turn off some filters."));
      return;
    }
    container.appendChild(el("p", { className: "count" }, list.length + (list.length === 1 ? " school" : " schools") + (state.near ? " near you" : "")));
    container.appendChild(el("div", { className: "card-grid" }, list.map(schoolCard)));
  }

  function extrasSummary(s) {
    var extras = L.yearlyExtras(s);
    var unpriced = L.unpricedCosts(s).length;
    if (extras > 0) return L.formatRand(extras) + " a year in extras not on the fee sheet" + (unpriced ? ", plus " + unpriced + " unpriced" : "");
    if (unpriced) return unpriced + (unpriced === 1 ? " extra cost" : " extra costs") + " the school doesn't price";
    return null;
  }

  function schoolCard(s) {
    var sub = [s.type, s.grades, s.language].filter(Boolean).join(" · ");
    var place = [s.area, s.city].filter(Boolean).join(", ");
    var dist = s.distanceKm != null ? " · " + s.distanceKm.toFixed(1) + " km" : "";
    var extras = extrasSummary(s);

    return el("a", { className: "card", href: schoolHref(s) },
      el("div", { className: "card-top" },
        el("div", { className: "initials", aria: { hidden: "true" } }, initials(s.name)),
        el("div", {}, el("h3", {}, s.name), el("div", { className: "muted small" }, sub), el("div", { className: "muted small" }, place + dist))),
      el("div", { className: "money-pair" },
        el("div", { className: "money" }, el("div", { className: "label" }, "School fees / month"), el("strong", {}, money(L.monthlyFees(s)))),
        el("div", { className: "money true" }, el("div", { className: "label" }, "True cost / year"), el("strong", {}, money(L.trueYearlyCost(s))))),
      extras && el("div", { className: "extras-line" }, icon("alert"), extras));
  }

  // ---------- School profile ----------

  function renderSchool(id) {
    var s = findSchool(id);
    if (!s) return notFound();
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
      el("div", { className: "sub" }, [s.address || [s.area, s.city].filter(Boolean).join(", "), dist != null ? dist.toFixed(1) + " km from you" : ""].filter(Boolean).join(" · ")),
      el("div", { className: "pills" }, [s.type, s.phase, s.grades, s.language].filter(Boolean).map(function (t) { return el("span", { className: "pill" }, t); })));

    // Grade picker, when the school charges different fees per grade.
    var picker = null;
    if (Array.isArray(f.byGrade) && f.byGrade.length) {
      var sel = el("select", { id: "grade" }, el("option", { value: "" }, "Entry grade"),
        f.byGrade.map(function (g) { return el("option", { value: g.grade, selected: g.grade === grade }, g.grade); }));
      sel.addEventListener("change", function () { state.grade[s.id] = sel.value; renderSchool(id); });
      picker = el("label", { className: "grade-picker", htmlFor: "grade" }, "Fees for", sel);
    }

    var feePct = total ? Math.round((fees / total) * 100) : 100;
    var trueCard = el("section", { className: "panel" },
      el("div", { className: "label" }, "True cost per year" + (f.year ? " · " + f.year + " fees" : " · fee year unknown")),
      el("div", { className: "big-money" }, money(total)),
      total ? el("div", { className: "bar", aria: { hidden: "true" } },
        el("div", { className: "fees", css: { width: feePct + "%" } }), el("div", { className: "extra", css: { width: (100 - feePct) + "%" } })) : null,
      total ? el("div", { className: "legend" }, el("span", {}, "Fees " + L.formatRand(fees)), el("span", { className: "h" }, extras > 0 ? "Extras " + L.formatRand(extras) : "No priced extras")) : null,
      f.unofficial ? el("div", { className: "extras-line" }, icon("alert"), f.sourceNote || "These fees are not from the school itself. Confirm them with the school.") : null,
      unpriced.length ? el("div", { className: "extras-line" }, icon("alert"), "Plus " + unpriced.length + (unpriced.length === 1 ? " cost" : " costs") + " the school doesn't publish a price for") : null,
      maybe.length ? el("div", { className: "extras-line" }, icon("alert"), maybe.length + (maybe.length === 1 ? " cost that might" : " costs that might") + " also apply to you (boarding, optional or subject extras), not included") : null,
      f.year && f.year < new Date().getFullYear() ? el("div", { className: "extras-line" }, icon("alert"), "These are " + f.year + " fees and may be out of date.") : null,
      picker);

    var facts = el("div", { className: "facts" },
      fact(monthlyLabel(s, grade), money(L.monthlyFees(s, grade))),
      fact("Registration", money(f.registration)),
      fact("Once-off to start", startUpText(s, grade)),
      fact("Aftercare", optionalText(s.aftercare)));

    var rows = el("section", { className: "panel" }, el("ul", { className: "rows" },
      navRow(schoolHref(s, "/costs"), "Fees & hidden costs", hiddenCount ? el("span", { className: "badge" }, hiddenCount + (hiddenCount === 1 ? " extra" : " extras")) : null)));

    var parts = [
      head, trueCard, zoneBanner(s, dist), facts, rows,
      outingsPanel(s),
      panel("Aftercare & transport", el("ul", { className: "rows" },
        row("Aftercare", optionalText(s.aftercare)), row("Transport", optionalText(s.transport)))),
      admissionsPanel(s),
      panel("Sports & clubs", (s.sports || []).length
        ? el("div", { className: "tags" }, s.sports.map(function (x) { return el("span", { className: "pill light" }, x); }))
        : el("p", { className: "empty" }, L.UNKNOWN)),
      panel("Contact", el("ul", { className: "rows" },
        row("Phone", s.phone || unknown()),
        row("Email", s.email || unknown()),
        row("Website", link(s.website)))),
      sourceLine(s)
    ];

    var phoneHref = s.phone ? "tel:" + String(s.phone).replace(/[^\d+]/g, "") : null;
    var contact = phoneHref ? el("a", { className: "btn solid", href: phoneHref }, icon("phone"), "Contact school")
      : L.safeUrl(s.website) ? el("a", { className: "btn solid", href: L.safeUrl(s.website), target: "_blank", rel: "noopener noreferrer" }, "Visit website") : null;
    var sticky = el("div", { className: "sticky-actions" },
      el("a", { className: "btn", href: "#/compare/" + encodeURIComponent(s.id) }, icon("compare"), "Compare"), contact);

    replace(parts, { sticky: sticky, tab: "search" });
    window.scrollTo(0, 0);
  }

  // The teal "feeder zone" banner. Any distance is worked out on this device only.
  function zoneBanner(s, dist) {
    var a = s.admissions || {};
    var zone = a.feederZone || {};
    var pub = (s.provinceRules || {}).publicRules;
    var priv = (s.provinceRules || {}).privateRules;
    var lines = [], title, guide = null, btn = null;
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

    return panel("Admissions & feeder zone",
      sub("At this school", bullets(a.rules)),
      el("ul", { className: "rows" },
        a.applyBy ? row("Apply by", dateWithStatus(a.applyBy))
          : pub && pub.closes ? row("KZN closing date", dateWithStatus(pub.closes))
          : row("Apply by", unknown()),
        a.applyUrl ? row("How to apply", link(a.applyUrl)) : null,
        a.source ? row("Source", link(a.source)) : null),
      pub ? [
        sub("When to apply (all KZN public schools)", pub.windowText && el("p", { className: "small" }, pub.windowText)),
        sub("How far can you live?", bullets(pub.howFarDetails)),
        sub("Documents you'll need", bullets(pub.documents)),
        sub("Age rules", bullets(pub.ageRules)),
        sub("Your rights", bullets(pub.yourRights)),
        sub("If you're refused", bullets(pub.ifRefused)),
        pub.warning && el("div", { className: "extras-line" }, icon("alert"), pub.warning),
        el("p", { className: "source" }, "KZN rules checked " + (pr.checked || "date unknown") + ". ",
          pub.windowSource ? link(pub.windowSource, "Source") : null)
      ] : null,
      priv ? sub("How private school admission usually works", bullets(priv.usualSteps)) : null);
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
      el("div", { className: "big-money" }, money(per(L.trueYearlyCost(s, grade)))),
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
        el("section", { className: "panel" },
          crow("School fees / year", money(L.yearlyFees(A, ga)), money(L.yearlyFees(B, gb))),
          crow("Monthly fee", [money(L.monthlyFees(A, ga)), paymentsText(A, ga)], [money(L.monthlyFees(B, gb)), paymentsText(B, gb)]),
          crow("Extras not on the fee sheet / year", L.formatRand(L.yearlyExtras(A, ga)), L.formatRand(L.yearlyExtras(B, gb)), true),
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
    ], { tab: "compare" });
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
      el("p", {}, "You can use School Finder without an account. We don't use tracking, adverts or analytics."),
      el("h2", {}, "Your location"),
      el("p", {}, "If you tap “Use my location” or “Am I in the zone?”, your location is rounded to about 1 km and used only on your device to work out distances. It is never sent to us or saved."),
      el("h2", {}, "Saved schools"),
      el("p", {}, "Schools you bookmark are stored in your browser on this device only. Clearing your browser data removes them."),
      el("h2", {}, "School information"),
      el("p", {}, "Fees and costs come from each school's public website and fee letters. Every school page shows its sources and the date we checked. Always confirm with the school before making decisions."),
      el("h2", {}, "Your rights"),
      el("p", {}, "We follow South Africa's Protection of Personal Information Act (POPIA). Because we don't collect personal information, there is nothing about you for us to store or delete.")
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

  function optionalText(o) {
    if (!o) return unknown();
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
    else renderSearch();
  }

  function start(data, admissions) {
    schools = L.mergeAdmissions(L.cleanSchools(data), L.cleanAdmissionsFile(admissions));
    var problems = L.dataProblems(schools);
    if (problems.length && window.console) console.warn("School data problems (shown as unpriced):\n" + problems.join("\n"));
    window.addEventListener("hashchange", route);
    route();
  }

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

  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // Data is embedded (window.SCHOOL_DATA / ADMISSIONS_DATA) in single-file previews, otherwise loaded from data/.
  // Admission rules are optional: if they fail to load, the app still works without them.
  if (Array.isArray(window.SCHOOL_DATA)) {
    start(window.SCHOOL_DATA, window.ADMISSIONS_DATA);
  } else {
    Promise.all([getJson("data/schools.json"), getJson("data/admissions-kzn.json").catch(function () { return null; })])
      .then(function (both) { start(both[0], both[1]); }, function () {
        // Only a failed download lands here; a bug while drawing shows up in the console instead.
        replace([el("h1", { className: "screen-title" }, "Can't load schools"),
          el("p", {}, "Check your internet connection and refresh the page.")], {});
      });
  }
})();
