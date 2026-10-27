// places.js — smarter location search.
// Knows the rough centre of the suburbs and towns we cover, so typing "Waterfall" finds schools
// NEAR Waterfall (sorted by distance), not only schools with "Waterfall" in their address.
// Also suggests a spelling when nothing matches ("Hilcrest" → "Hillcrest").
// Kept in its own file so it doesn't clash with cost-maths edits in logic.js.

(function (root) {
  var L = (typeof module !== "undefined" && module.exports) ? require("./logic.js") : root.SchoolLogic;

  // Approximate centre points (lat, lng). Good enough to sort schools by distance, not for directions.
  // Add more places here as we add schools in new areas.
  var PLACES = [
    // KwaZulu-Natal: Upper Highway and nearby
    { name: "Waterfall", region: "KZN", lat: -29.7525, lng: 30.7930 },
    { name: "Hillcrest", region: "KZN", lat: -29.7790, lng: 30.7630 },
    { name: "Kloof", region: "KZN", lat: -29.7900, lng: 30.8330 },
    { name: "Gillitts", region: "KZN", lat: -29.7960, lng: 30.7930 },
    { name: "Winston Park", region: "KZN", lat: -29.7880, lng: 30.7800 },
    { name: "Forest Hills", region: "KZN", lat: -29.7640, lng: 30.8150 },
    { name: "Botha's Hill", region: "KZN", lat: -29.7560, lng: 30.7380, aliases: ["bothas hill"] },
    { name: "Assagay", region: "KZN", lat: -29.7720, lng: 30.7220 },
    { name: "Alverstone", region: "KZN", lat: -29.7780, lng: 30.7340 },
    { name: "Hilldene", region: "KZN", lat: -29.7700, lng: 30.7700 },
    { name: "KwaNgcolosi", region: "KZN", lat: -29.7130, lng: 30.8190, aliases: ["ngcolosi", "kwa ngcolosi"] },
    { name: "Embo", region: "KZN", lat: -29.7650, lng: 30.7000 },
    { name: "KwaNyuswa", region: "KZN", lat: -29.7000, lng: 30.7450, aliases: ["nyuswa", "kwa nyuswa"] },
    { name: "Everton", region: "KZN", lat: -29.8000, lng: 30.8100 },
    { name: "Pinetown", region: "KZN", lat: -29.8170, lng: 30.8570 },
    { name: "Westville", region: "KZN", lat: -29.8330, lng: 30.9300 },
    { name: "Durban", region: "KZN", lat: -29.8580, lng: 31.0290, aliases: ["dbn"] },
    { name: "Umhlanga", region: "KZN", lat: -29.7270, lng: 31.0850 },
    { name: "Pietermaritzburg", region: "KZN", lat: -29.6000, lng: 30.3790, aliases: ["pmb"] },
    // Gauteng
    { name: "Pretoria", region: "Gauteng", lat: -25.7460, lng: 28.1880, aliases: ["pta", "tshwane"] },
    { name: "East Lynne", region: "Gauteng", lat: -25.7000, lng: 28.2800 },
    { name: "Centurion", region: "Gauteng", lat: -25.8600, lng: 28.1900 },
    { name: "Hillcrest", region: "Gauteng", lat: -25.7570, lng: 28.2360, note: "Pretoria" },
    { name: "Waterfall", region: "Gauteng", lat: -26.0050, lng: 28.1050, note: "Midrand", aliases: ["waterfall midrand", "waterfall city"] },
    { name: "Midrand", region: "Gauteng", lat: -25.9890, lng: 28.1280 },
    { name: "Johannesburg", region: "Gauteng", lat: -26.2040, lng: 28.0470, aliases: ["joburg", "jozi", "jhb", "johannesberg"] },
    { name: "Fourways", region: "Gauteng", lat: -26.0160, lng: 28.0060 },
    { name: "Sandton", region: "Gauteng", lat: -26.1070, lng: 28.0560 },
    { name: "Randburg", region: "Gauteng", lat: -26.0940, lng: 28.0060 },
    { name: "Houghton", region: "Gauteng", lat: -26.1700, lng: 28.0600 },
    { name: "Parktown", region: "Gauteng", lat: -26.1800, lng: 28.0350 }
  ];

  var RADII = [2, 5, 10, 20]; // km choices offered on the search screen

  // How many single-letter edits turn a into b (Levenshtein distance). Used for spelling suggestions.
  function editDistance(a, b) {
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function key(text) { return L.normalise(text).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }

  // Words for each region, so "Hillcrest, KZN" or "Waterfall Gauteng" can pick the right one.
  var REGION_WORDS = {
    KZN: ["kzn", "kwazulu natal", "kwazulunatal", "natal"],
    Gauteng: ["gauteng", "gp", "gt"]
  };

  // "Hillcrest, KZN 3610" -> { text: "hillcrest", region: "KZN" }. Strips commas, postcodes and a trailing province.
  function splitQuery(query) {
    var q = key(String(query == null ? "" : query).replace(/,/g, " ")).replace(/\b\d{4}\b/g, "").replace(/\s+/g, " ").trim();
    var region = null;
    Object.keys(REGION_WORDS).forEach(function (r) {
      REGION_WORDS[r].forEach(function (w) {
        if (!region && q.length > w.length && q.slice(-w.length - 1) === " " + w) { region = r; q = q.slice(0, -w.length - 1).trim(); }
      });
    });
    return { text: q, region: region };
  }

  // Every known place whose name or nickname is exactly what was typed (two when a name exists in two provinces).
  function findPlaces(query) {
    var sq = splitQuery(query);
    if (!sq.text) return [];
    return PLACES.filter(function (p) {
      var hit = key(p.name) === sq.text || (p.aliases || []).some(function (a) { return key(a) === sq.text; });
      return hit && (!sq.region || p.region === sq.region);
    });
  }

  // Is the whole search a place we know? "waterfall", "Botha's Hill", "jhb", "Hillcrest, KZN" → that place.
  // When a name is in two provinces and the parent didn't say which, the first listed (the area we cover best) wins,
  // and the app offers the other one ("Looking for Waterfall, Midrand, Gauteng?").
  function findPlace(query) {
    return findPlaces(query)[0] || null;
  }

  // Other places with the same name in another province.
  function namesakes(place) {
    return place ? PLACES.filter(function (p) { return p !== place && p.name === place.name; }) : [];
  }

  // "Waterfall, KZN" style label, used wherever a place is shown so same-name places can't be mixed up.
  function placeLabel(p) { return p ? p.name + ", " + (p.note ? p.note + ", " : "") + p.region : ""; }

  // Closest-spelled known place or school area, for "Did you mean …?". Only offered when close enough.
  function suggest(query, schools) {
    var q = key(query);
    if (q.length < 3) return null;
    var names = PLACES.map(function (p) { return p.name; })
      .concat((schools || []).map(function (s) { return s.area; }), (schools || []).map(function (s) { return s.city; }))
      .filter(Boolean);
    var best = null, bestScore = Infinity;
    names.forEach(function (n) {
      var d = editDistance(q, key(n));
      if (d < bestScore) { best = n; bestScore = d; }
    });
    var allowed = q.length <= 5 ? 1 : 2; // short words need a closer match
    return best && bestScore > 0 && bestScore <= allowed ? best : null;
  }

  // Schools near a point, within radiusKm, closest first.
  // Schools with no published location are returned separately when their address names the chosen place,
  // or (for "near me") any known place within the radius, so GPS users still see them.
  function schoolsNear(schools, point, radiusKm, placeName) {
    var near = [], unknown = [];
    var names = placeName ? [placeName] : PLACES.filter(function (p) {
      // +3 km because place centres are rough: a school "in Forest Hills" can sit nearer than the suburb's middle.
      return L.distanceKm(point.lat, point.lng, p.lat, p.lng) <= Math.max(radiusKm, 5) + 3;
    }).map(function (p) { return p.name; });
    schools.forEach(function (s) {
      if (typeof s.lat === "number" && typeof s.lng === "number") {
        var d = L.distanceKm(point.lat, point.lng, s.lat, s.lng);
        if (d <= radiusKm) near.push(Object.assign({}, s, { distanceKm: d }));
      } else if (names.some(function (n) { return L.matchesQuery(s, n); })) {
        unknown.push(Object.assign({}, s, { distanceKm: null }));
      }
    });
    near.sort(function (a, b) { return a.distanceKm - b.distanceKm; });
    return { near: near, unknownLocation: unknown };
  }

  // Places whose name starts with (or contains) what the parent has typed so far, for the suggestion list.
  function matchPlaces(text, limit) {
    var q = splitQuery(text).text;
    if (!q) return [];
    var starts = [], contains = [];
    PLACES.forEach(function (p) {
      var names = [p.name].concat(p.aliases || []).map(key);
      if (names.some(function (n) { return n.indexOf(q) === 0; })) starts.push(p);
      else if (names.some(function (n) { return n.indexOf(q) !== -1; })) contains.push(p);
    });
    return starts.concat(contains).slice(0, limit || 6);
  }

  // "Waterfall" or "Waterfall|Gauteng" (how the last place is remembered) -> that place. Plain names mean the first one.
  function placeByName(name) {
    var parts = String(name || "").split("|");
    return PLACES.filter(function (p) { return p.name === parts[0] && (!parts[1] || p.region === parts[1]); })[0] || null;
  }

  L.PLACES = PLACES;
  L.matchPlaces = matchPlaces;
  L.placeByName = placeByName;
  L.RADII = RADII;
  L.editDistance = editDistance;
  L.findPlace = findPlace;
  L.findPlaces = findPlaces;
  L.namesakes = namesakes;
  L.placeLabel = placeLabel;
  L.splitQuery = splitQuery;
  L.suggestPlace = suggest;
  L.schoolsNear = schoolsNear;
  if (typeof module !== "undefined" && module.exports) module.exports = L;
})(this);
