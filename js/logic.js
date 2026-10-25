// logic.js — the "brain" of the app: searching, filtering and cost maths.
// It has no screen code in it, so the Tester can run it on its own in Node.

(function (root) {
  // How many times a year each kind of cost is paid.
  var TIMES_PER_YEAR = { once: 0, yearly: 1, "per term": 4, monthly: 12 };
  var SCHOOL_MONTHS = 12; // used only when a school doesn't say how many instalments it bills

  // Other ways schools write the same frequency. Anything not in here is "unknown" and gets flagged.
  var FREQUENCY_NAMES = {
    once: "once", "once off": "once", "once-off": "once", "one off": "once", "one-off": "once", "on acceptance": "once",
    yearly: "yearly", annually: "yearly", annual: "yearly", "per year": "yearly", "a year": "yearly", "per annum": "yearly", "each year": "yearly",
    "per term": "per term", termly: "per term", "each term": "per term", "a term": "per term", quarterly: "per term",
    monthly: "monthly", "per month": "monthly", "a month": "monthly", "each month": "monthly"
  };

  // Who pays a hidden cost. Only "everyone" goes into the totals; the rest are listed as "might also apply".
  // Other words the data might use for the same thing.
  var APPLIES_NAMES = {
    everyone: "everyone", all: "everyone", "all learners": "everyone", "all pupils": "everyone", "all students": "everyone",
    compulsory: "everyone", mandatory: "everyone", required: "everyone",
    optional: "optional", "if chosen": "optional", subject: "subject", boarders: "boarders", boarder: "boarders", boarding: "boarders",
    penalty: "penalty", penalties: "penalty", some: "some"
  };

  var APPLIES_LABELS = {
    optional: "Optional", subject: "Only if your child takes the subject", boarders: "Boarders only",
    penalty: "Penalty, only if a payment is late or missed", some: "Only some learners"
  };

  function isNum(n) {
    return typeof n === "number" && isFinite(n) && n >= 0;
  }

  // "Monthly", "termly", "per term " -> "monthly", "per term". Unknown -> null.
  function normaliseFrequency(freq) {
    var key = String(freq == null ? "" : freq).toLowerCase().replace(/[_\s]+/g, " ").trim();
    return FREQUENCY_NAMES[key] || null;
  }

  // "everyone" (the default, also "all", "compulsory"...), "optional", "boarders", ... or a grade like "Gr 12"
  // (also accepts "grade:12", "Grade 12", "Gr 10-12"). Words we don't know are returned as-is and flagged by isKnownApplies.
  function normaliseApplies(applies) {
    var a = String(applies == null ? "" : applies).trim();
    if (!a) return "everyone";
    var g = a.match(/^(?:grade\s*:?\s*|gr\.?\s*)(.+)$/i);
    if (g) return "Gr " + g[1].trim().replace(/\s*(?:-|–|to)\s*/i, "-");
    var key = a.toLowerCase().replace(/\s+/g, " ");
    return APPLIES_NAMES[key] || key;
  }

  function isGradeOnly(c) { return /^Gr /.test(normaliseApplies(c.applies)); }
  function isKnownApplies(a) { a = normaliseApplies(a); return /^Gr /.test(a) || a === "everyone" || !!APPLIES_LABELS[a]; }

  // The grades in a label: "Gr 10-12" -> ["10","11","12"], "Gr R" -> ["R"], "Gr 1-2" -> ["1","2"].
  function gradeSet(label) {
    var m = String(label || "").replace(/^(?:grade\s*:?\s*|gr\.?\s*)/i, "").trim();
    var r = m.match(/^(R|\d+)\s*(?:-|–|to)\s*(\d+)$/i);
    if (!r) return [m.toUpperCase()];
    var from = /^r$/i.test(r[1]) ? 0 : Number(r[1]), to = Number(r[2]), out = [];
    for (var i = from; i <= to && out.length < 20; i++) out.push(i === 0 ? "R" : String(i));
    return out;
  }

  // Is every grade in the picked band covered by the cost's grades? ("Gr 12" cost, picked "Gr 12" -> yes;
  // picked "Gr 10-12" -> no, it's only one of those years, so it's listed under "might also apply".)
  function gradeCovers(costLabel, picked) {
    if (!picked) return false;
    var cost = gradeSet(costLabel);
    return gradeSet(picked).every(function (g) { return cost.indexOf(g) !== -1; });
  }

  // Does this cost go into the totals for this grade? Everyone-items (not already inside the fee) always do;
  // grade-only items (e.g. "Gr 12" exam fee) only when the picked grade falls inside them.
  function countsInTotal(c, grade) {
    if (c.included === true) return false;
    var a = normaliseApplies(c.applies);
    if (a === "everyone") return !c.per; // "per day" style prices can't be added up
    return isGradeOnly(c) && gradeCovers(a, grade);
  }

  // Why a cost isn't in the total, in plain words ("Boarders only", "Gr 12 only", ...).
  function appliesLabel(c) {
    var a = normaliseApplies(c.applies);
    if (c.included === true) return "Already part of the school fees";
    if (isGradeOnly(c)) return a + " only";
    if (a === "everyone" && c.per) return "Charged per " + c.per;
    return APPLIES_LABELS[a] || "Check with the school who pays this";
  }

  // Strict money parsing for data cleaning: 1500, "1500", "R1,500", "R 1 500", "R 45 000,00". Anything else -> null.
  function parseAmount(v) {
    if (isNum(v)) return v;
    if (typeof v !== "string") return null;
    var t = v.replace(/^\s*R\s*/i, "").replace(/\s+/g, "");
    // "1.500" or "1.500,00": dots as thousand separators (rand cents always have 2 digits, never 3).
    if (/^\d{1,3}(\.\d{3})+(,\d{2})?$/.test(t)) t = t.replace(/\./g, "");
    if (/^\d+,\d{2}$/.test(t) || /^\d{1,3}(,\d{3})+,\d{2}$/.test(t)) t = t.replace(/,(\d{2})$/, ".$1");
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return null;
    var n = Number(t.replace(/,/g, ""));
    return isNum(n) ? n : null;
  }

  // Lowercase, trim, squash spaces, drop accents, so "  Cape   TOWN " matches "Cape Town".
  function normalise(text) {
    return String(text == null ? "" : text)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  // Fees for one grade if the school lists fees per grade, otherwise the headline fees.
  function feeRow(school, grade) {
    var f = school.fees || {};
    if (grade && Array.isArray(f.byGrade)) {
      var row = f.byGrade.filter(function (g) { return g && g.grade === grade; })[0];
      if (row) return row;
    }
    return f;
  }

  // How many instalments the school bills fees over (10, 11 or 12). A grade row can override the school's number
  // (Waterfall College Gr 12 pays over 10 months). null when the school doesn't say.
  function instalments(school, grade) {
    var row = feeRow(school, grade), f = school.fees || {};
    var n = isNum(row.instalments) ? row.instalments : f.instalments;
    return isNum(n) && n >= 1 && n <= 12 ? n : null;
  }

  // Yearly tuition: use the stated yearly figure, otherwise monthly x number of instalments.
  function yearlyFees(school, grade) {
    var f = feeRow(school, grade);
    if (isNum(f.yearly)) return f.yearly;
    if (isNum(f.monthly)) return f.monthly * (instalments(school, grade) || SCHOOL_MONTHS);
    return null;
  }

  // Monthly tuition: the stated monthly figure, otherwise yearly / the school's instalments.
  // This is a real instalment (e.g. 10 x R7,950), not a 12-month average.
  function monthlyFees(school, grade) {
    var f = feeRow(school, grade);
    if (isNum(f.monthly)) return f.monthly;
    if (isNum(f.yearly)) return Math.round(f.yearly / (instalments(school, grade) || SCHOOL_MONTHS));
    return null;
  }

  // Amount per year for one hidden cost, or null if it can't be worked out.
  function perYear(c) {
    var times = TIMES_PER_YEAR[normaliseFrequency(c.frequency)];
    if (!isNum(c.amount) || !times) return null;
    return c.amount * times;
  }

  // Recurring hidden costs that every child pays, turned into a per-year amount.
  // Grade-only costs (e.g. the Gr 12 exam fee) are added when that grade is picked; once-off ones count in that year.
  function yearlyHiddenCosts(school, grade) {
    return (school.hiddenCosts || []).reduce(function (sum, c) {
      if (!countsInTotal(c, grade)) return sum;
      if (isGradeOnly(c) && normaliseFrequency(c.frequency) === "once") return isNum(c.amount) ? sum + c.amount : sum;
      var y = perYear(c);
      return y === null ? sum : sum + y;
    }, 0);
  }

  // Once-off costs every new child pays when they start (registration, deposit, "once" items for everyone).
  // Boarder-only, optional, penalty and later-grade costs are left out; so are items already inside the fees.
  function startUpCosts(school) {
    var f = school.fees || {};
    var amounts = [f.registration, f.deposit];
    (school.hiddenCosts || []).forEach(function (c) {
      if (normaliseFrequency(c.frequency) === "once" && countsInTotal(c, null)) amounts.push(c.amount);
    });
    var known = amounts.filter(isNum);
    // null (unknown) rather than R 0 when the school hasn't published any of these.
    return known.length ? known.reduce(function (a, b) { return a + b; }, 0) : null;
  }

  // Costs every child pays that the school doesn't price (e.g. uniform "not priced"),
  // or whose frequency we couldn't understand, so the app can warn rather than show a too-low total.
  function unpricedCosts(school) {
    return (school.hiddenCosts || []).filter(function (c) {
      return countsInTotal(c, null) && (!isNum(c.amount) || !normaliseFrequency(c.frequency));
    }).concat((school.outings || []).filter(function (o) { return !isNum(o.cost); }));
  }

  // Costs that are NOT in the totals because they only apply to some families:
  // optional, subject-only, boarders, penalties, other grades, or already inside the fees.
  function mightAlsoApply(school, grade) {
    return (school.hiddenCosts || []).filter(function (c) { return !countsInTotal(c, grade); });
  }

  // Everything not on the fee sheet, per year: recurring hidden costs + outings.
  function yearlyExtras(school, grade) {
    return yearlyHiddenCosts(school, grade) + yearlyOutings(school);
  }

  function yearlyOutings(school) {
    return (school.outings || []).reduce(function (sum, o) {
      return isNum(o.cost) ? sum + o.cost : sum;
    }, 0);
  }

  // The headline number: what a year at this school really costs.
  // Tuition + hidden costs every child pays (plus that grade's own costs) + outings.
  // Optional, boarder-only, subject-only and penalty costs, and aftercare/transport, are not included.
  function trueYearlyCost(school, grade) {
    var fees = yearlyFees(school, grade);
    if (fees === null) return null;
    return fees + yearlyExtras(school, grade);
  }

  // Distance in km between two lat/lng points (haversine formula).
  function distanceKm(lat1, lng1, lat2, lng2) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Nicknames parents type for places. Each word is swapped for the full name before matching.
  var NICKNAMES = {
    joburg: "johannesburg", johannesberg: "johannesburg", jozi: "johannesburg", jhb: "johannesburg", jnb: "johannesburg",
    pta: "pretoria", dbn: "durban", pmb: "pietermaritzburg", cpt: "cape town", kzn: "kwazulu-natal"
  };

  // Does this school match the words the parent typed? Every word must appear somewhere
  // (in its name, place, or the other names it's known by, e.g. "German school").
  function matchesQuery(school, query) {
    var q = normalise(query).slice(0, 100);
    if (!q) return true;
    var haystack = normalise([school.name, school.area, school.city, school.province,
      school.postcode, school.address].concat(school.aliases || []).join(" "));
    return q.split(" ").every(function (word) {
      return haystack.indexOf(NICKNAMES[word] || word) !== -1 || haystack.indexOf(word) !== -1;
    });
  }

  // filters: { query, type, phase, maxMonthly, near: {lat, lng} }
  function searchSchools(schools, filters) {
    filters = filters || {};
    var results = (schools || []).filter(function (s) {
      if (!s || !s.name) return false;
      if (!matchesQuery(s, filters.query)) return false;
      if (filters.type && s.type !== filters.type) return false;
      if (filters.phase && s.phase !== filters.phase && s.phase !== "Combined") return false;
      if (isNum(filters.maxMonthly)) {
        var m = monthlyFees(s);
        if (m === null || m > filters.maxMonthly) return false;
      }
      return true;
    });

    var near = filters.near;
    // typeof check first: Math.abs(null) is 0, which would put the parent at 0,0 in the sea.
    if (near && typeof near.lat === "number" && typeof near.lng === "number" &&
        isNum(Math.abs(near.lat)) && isNum(Math.abs(near.lng))) {
      results = results.map(function (s) {
        var d = (typeof s.lat === "number" && typeof s.lng === "number")
          ? distanceKm(near.lat, near.lng, s.lat, s.lng) : null;
        return Object.assign({}, s, { distanceKm: d });
      }).sort(function (a, b) {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    } else {
      results.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    return results;
  }

  var UNKNOWN = "Not published by school";

  // R34,800 (the Designer's format). Unknown amounts never show as R0.
  function formatRand(amount) {
    if (!isNum(amount)) return UNKNOWN;
    return "R" + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Only allow real web links, so a bad data file can't sneak in a "javascript:" link.
  function safeUrl(url) {
    try {
      var u = new URL(String(url));
      return (u.protocol === "https:" || u.protocol === "http:") ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- Data cleaning ----------
  // School data comes from scraped websites, so check every field's type before the app uses it.
  // Wrong types become null / empty lists, so one bad value can't break the whole app.

  function str(v) { return typeof v === "string" ? v.slice(0, 500) : (typeof v === "number" && isFinite(v) ? String(v) : null); }
  function num(v) { return isNum(v) ? v : null; }
  function coord(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function list(v, fn) { return Array.isArray(v) ? v.map(fn).filter(Boolean) : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
  function option(v) { v = obj(v); return v ? { available: v.available === true, monthly: num(v.monthly) } : null; }

  // A hidden cost from the data file. Text amounts ("1500", "R1,500") become numbers; frequencies are normalised
  // ("Monthly", "termly" -> "monthly", "per term"). Anything we can't understand is kept but flagged in
  // `problem`, so it's shown as unpriced (never silently dropped) and the Info Puller can see it.
  var MAX_COST = 1000000;

  function cleanCost(c) {
    c = obj(c);
    if (!c || !str(c.item)) return null;
    var amount = parseAmount(c.amount);
    var frequency = normaliseFrequency(c.frequency);
    var problems = [];
    if (c.amount != null && amount === null) problems.push("amount '" + str(c.amount) + "' is not a number");
    // A typo like 450000 for a R450 item would blow up the total, so huge amounts are held back until checked.
    if (amount !== null && amount > MAX_COST) { problems.push("amount R" + amount + " is over R1,000,000, check it"); amount = null; }
    if (!frequency) problems.push("frequency '" + str(c.frequency) + "' is not one we know");
    if (!isKnownApplies(str(c.applies))) problems.push("applies '" + str(c.applies) + "' is not one we know");
    return {
      item: str(c.item), amount: amount, frequency: frequency || str(c.frequency), note: str(c.note),
      applies: normaliseApplies(str(c.applies)), included: c.included === true,
      priceFor: str(c.priceFor), per: str(c.per),
      problem: problems.length ? problems.join("; ") : null
    };
  }

  function cleanSchool(raw) {
    var s = obj(raw);
    if (!s || !str(s.id) || !str(s.name)) return null;
    var f = obj(s.fees) || {};
    var a = obj(s.admissions);
    var zone = a && obj(a.feederZone);
    // Fee text we can't read ("about R45k") becomes null, but is noted so dataProblems() can report it.
    var feeProblems = [];
    function fee(v, label) {
      var n = parseAmount(v);
      if (v != null && v !== "" && n === null) feeProblems.push(label + " '" + str(v) + "' is not a number");
      return n;
    }
    return {
      id: str(s.id), name: str(s.name), sample: s.sample === true,
      type: str(s.type), phase: str(s.phase), grades: str(s.grades), language: str(s.language),
      area: str(s.area), city: str(s.city), province: str(s.province), postcode: str(s.postcode), address: str(s.address),
      lat: coord(s.lat), lng: coord(s.lng),
      website: str(s.website), phone: str(s.phone), email: str(s.email),
      aliases: list(s.aliases, str),
      fees: {
        year: num(f.year), yearly: fee(f.yearly, "yearly fee"), monthly: fee(f.monthly, "monthly fee"),
        registration: fee(f.registration, "registration"), deposit: fee(f.deposit, "deposit"), notes: str(f.notes),
        instalments: num(f.instalments), instalmentsNote: str(f.instalmentsNote),
        // Fees not from the school itself (e.g. a news survey) get a visible warning.
        unofficial: f.unofficial === true || f.sourceIsSchool === false, sourceNote: str(f.sourceNote),
        problems: feeProblems,
        byGrade: list(f.byGrade, function (g) { g = obj(g); return g && str(g.grade) ? { grade: str(g.grade), yearly: fee(g.yearly, str(g.grade) + " yearly fee"), monthly: fee(g.monthly, str(g.grade) + " monthly fee"), instalments: num(g.instalments) } : null; })
      },
      hiddenCosts: list(s.hiddenCosts, cleanCost),
      outings: list(s.outings, function (o) { o = obj(o); return o && str(o.name) ? { name: str(o.name), grades: str(o.grades), cost: num(o.cost), when: str(o.when), note: str(o.note) } : null; }),
      aftercare: option(s.aftercare), transport: option(s.transport),
      sports: list(s.sports, str),
      admissions: a ? {
        feederZone: zone ? { radiusKm: num(zone.radiusKm), description: str(zone.description) } : null,
        rules: list(a.rules, str), applyBy: str(a.applyBy), applyUrl: str(a.applyUrl), source: str(a.source)
      } : null,
      lastChecked: str(s.lastChecked), sources: list(s.sources, str)
    };
  }

  function cleanSchools(data) {
    var seen = {};
    return (Array.isArray(data) ? data : []).map(cleanSchool).filter(function (s) {
      if (!s || seen[s.id]) return false; // skip broken records and duplicate ids
      seen[s.id] = true;
      return true;
    });
  }

  // Every fee and hidden cost the cleaner couldn't understand, so they can be fixed in the data file.
  function dataProblems(schools) {
    var out = [];
    (schools || []).forEach(function (s) {
      ((s.fees || {}).problems || []).forEach(function (p) { out.push(s.id + ": " + p); });
      (s.hiddenCosts || []).forEach(function (c) { if (c.problem) out.push(s.id + ": " + c.item + ": " + c.problem); });
    });
    return out;
  }

  var api = {
    cleanSchool: cleanSchool, cleanSchools: cleanSchools,
    UNKNOWN: UNKNOWN, isNum: isNum, feeRow: feeRow, unpricedCosts: unpricedCosts, yearlyExtras: yearlyExtras,
    normaliseFrequency: normaliseFrequency, normaliseApplies: normaliseApplies, parseAmount: parseAmount,
    countsInTotal: countsInTotal, gradeSet: gradeSet, appliesLabel: appliesLabel, mightAlsoApply: mightAlsoApply, perYear: perYear,
    instalments: instalments, dataProblems: dataProblems,
    normalise: normalise, yearlyFees: yearlyFees, monthlyFees: monthlyFees,
    yearlyHiddenCosts: yearlyHiddenCosts, startUpCosts: startUpCosts, yearlyOutings: yearlyOutings,
    trueYearlyCost: trueYearlyCost, distanceKm: distanceKm, matchesQuery: matchesQuery,
    searchSchools: searchSchools, formatRand: formatRand, safeUrl: safeUrl,
    TIMES_PER_YEAR: TIMES_PER_YEAR
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SchoolLogic = api;
})(this);
