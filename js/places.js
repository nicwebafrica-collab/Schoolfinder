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
    { name: "Johannesburg", region: "Gauteng", lat: -26.2040, lng: 28.0470, aliases: ["joburg", "jozi", "jhb", "johannesberg"] },
    { name: "Fourways", region: "Gauteng", lat: -26.0160, lng: 28.0060 },
    { name: "Sandton", region: "Gauteng", lat: -26.1070, lng: 28.0560 },
    { name: "Randburg", region: "Gauteng", lat: -26.0940, lng: 28.0060 },
    { name: "Houghton", region: "Gauteng", lat: -26.1700, lng: 28.0600 },
    { name: "Parktown", region: "Gauteng", lat: -26.1800, lng: 28.0350 }
  ];

  var RADII = [5, 10, 20]; // km choices offered on the search screen

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

  function key(text) { return L.normalise(text).replace(/[^a-z0-9 ]/g, ""); }

  // Is the whole search a place we know? "waterfall", "Botha's Hill", "jhb" → that place.
  function findPlace(query) {
    var q = key(query);
    if (!q) return null;
    return PLACES.filter(function (p) {
      return key(p.name) === q || (p.aliases || []).some(function (a) { return key(a) === q; });
    })[0] || null;
  }

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
  // Schools with no published location are returned separately, only if their address text matches the place.
  function schoolsNear(schools, point, radiusKm, placeName) {
    var near = [], unknown = [];
    schools.forEach(function (s) {
      if (typeof s.lat === "number" && typeof s.lng === "number") {
        var d = L.distanceKm(point.lat, point.lng, s.lat, s.lng);
        if (d <= radiusKm) near.push(Object.assign({}, s, { distanceKm: d }));
      } else if (placeName && L.matchesQuery(s, placeName)) {
        unknown.push(Object.assign({}, s, { distanceKm: null }));
      }
    });
    near.sort(function (a, b) { return a.distanceKm - b.distanceKm; });
    return { near: near, unknownLocation: unknown };
  }

  L.PLACES = PLACES;
  L.RADII = RADII;
  L.editDistance = editDistance;
  L.findPlace = findPlace;
  L.suggestPlace = suggest;
  L.schoolsNear = schoolsNear;
  if (typeof module !== "undefined" && module.exports) module.exports = L;
})(this);
