// admissions.js — admission rules and the feeder-zone check.
// Kept in its own file (separate from logic.js) so the cost maths and the admission rules can change independently.
// Adds its functions to SchoolLogic, so the rest of the app uses L.mergeAdmissions(...) etc.

(function (root) {
  var L = (typeof module !== "undefined" && module.exports) ? require("./logic.js") : root.SchoolLogic;

  // Type checks: admission rules are typed up by hand from websites, so check every field.
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
  function str(v) { return typeof v === "string" && v.trim() ? v.slice(0, 1000) : null; }
  function num(v) { return L.isNum(v) ? v : null; }
  function list(v, fn) { return Array.isArray(v) ? v.map(fn).filter(Boolean) : []; }

  var ZONE_KINDS = ["nearestSchool", "namedSchools", "radius", "private", "unknown"];

  // One school's admission info: its feeder zone and its own rules.
  function cleanSchoolAdmissions(a) {
    a = obj(a);
    if (!a) return null;
    var zone = obj(a.feederZone);
    return {
      feederZone: zone ? {
        kind: ZONE_KINDS.indexOf(zone.kind) !== -1 ? zone.kind : (L.isNum(zone.radiusKm) ? "radius" : "unknown"),
        radiusKm: num(zone.radiusKm), description: str(zone.description), feederSchools: list(zone.feederSchools, str)
      } : null,
      rules: list(a.rules, str), applyBy: str(a.applyBy), applyUrl: str(a.applyUrl), source: str(a.source)
    };
  }

  // The whole rules file from the Admissions Rules thread (data/admissions-kzn.json).
  function cleanAdmissionsFile(raw) {
    var d = obj(raw);
    if (!d) return null;
    var pub = obj(d.publicRules) || {}, win = obj(pub.applicationWindow) || {}, far = obj(pub.howFarCanYouLive) || {};
    var priv = obj(d.privateRules) || {};
    // No prototype, so a school id like "__proto__" or "constructor" can't pick up built-in object properties.
    var schools = Object.create(null);
    Object.keys(obj(d.schools) || {}).forEach(function (id) {
      var a = cleanSchoolAdmissions(d.schools[id]);
      if (a) schools[id] = a;
    });
    return {
      province: str(d.province), checked: str(d.checked),
      publicRules: {
        windowText: str(win.text), windowSource: str(win.source), opens: str(win.opens), closes: str(win.closes),
        howFarShort: str(far.short), howFarDetails: list(far.details, str),
        documents: list(pub.documents, str), ageRules: list(pub.ageRules, str), yourRights: list(pub.yourRights, str),
        ifRefused: list(pub.ifRefused, str), warning: str(pub.warning)
      },
      privateRules: { short: str(priv.short), usualSteps: list(priv.usualSteps, str) },
      schools: schools
    };
  }

  // Put each school's admission info, and its province's general rules, onto the school.
  // The rules file wins over any admissions info in schools.json.
  function mergeAdmissions(schools, adm) {
    return schools.map(function (s) {
      var copy = Object.assign({}, s);
      copy.admissions = (adm && adm.schools[s.id]) || cleanSchoolAdmissions(s.admissions);
      if (adm && adm.province && s.province === adm.province) {
        copy.provinceRules = s.type === "Private" ? { privateRules: adm.privateRules } : { publicRules: adm.publicRules };
        copy.provinceRules.checked = adm.checked;
      }
      return copy;
    });
  }

  // Rough "is this my nearest public school?" check for KZN's nearest-school rule.
  // Straight-line distance, only among the schools in this app. Returns null when we can't say:
  // no location, not a public school, fewer than 2 to compare, or a same-phase public school without coordinates.
  function nearestPublicCheck(schools, school, near) {
    if (!near || !school || school.type !== "Public" || typeof school.lat !== "number" || typeof school.lng !== "number") return null;
    function samePhase(x) { return x.phase === school.phase || x.phase === "Combined" || school.phase === "Combined"; }
    var rivals = schools.filter(function (x) { return x.type === "Public" && x.province === school.province && samePhase(x); });
    if (rivals.length < 2) return null;
    if (rivals.some(function (x) { return typeof x.lat !== "number" || typeof x.lng !== "number"; })) return null;
    var ranked = rivals.map(function (x) { return { school: x, km: L.distanceKm(near.lat, near.lng, x.lat, x.lng) }; })
      .sort(function (a, b) { return a.km - b.km; });
    // The location is rounded to ~1 km, so if the two closest are within 1 km of each other we can't tell them apart.
    var tooClose = Math.abs(ranked[0].km - ranked[1].km) < 1;
    return { isNearest: ranked[0].school.id === school.id, tooClose: tooClose, nearest: ranked[0].school };
  }

  L.cleanSchoolAdmissions = cleanSchoolAdmissions;
  L.cleanAdmissionsFile = cleanAdmissionsFile;
  L.mergeAdmissions = mergeAdmissions;
  L.nearestPublicCheck = nearestPublicCheck;
  if (typeof module !== "undefined" && module.exports) module.exports = L;
})(this);
