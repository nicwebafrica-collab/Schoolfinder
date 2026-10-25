# School Finder (v1)

Parents search their area and see the real cost of each school: fees, hidden costs, outings, aftercare and transport.

## Run it
```
cd /mnt/project-files/app
python3 -m http.server 8000
```
Then open http://localhost:8000. (Opening index.html directly won't load the data, because browsers block reading local files.)

## Files
- `index.html`: the page shell
- `styles.css`: the look (colours and fonts are variables at the top for the Designer)
- `js/logic.js`: search, filters and cost maths (no screen code, testable in Node: `require('./js/logic.js')`)
- `js/app.js`: draws the search and school screens
- `data/schools.json`: the school data (currently made-up samples marked `"sample": true`)

## How "real yearly cost" is worked out
Yearly tuition (or monthly x 12) + recurring hidden costs (yearly x1, per term x4, monthly x12) + all outings.
Once-off costs (registration, deposit, "once" items) are shown separately. Aftercare and transport are optional, so not included.
Unknown amounts show "Not published by school", never R0. Prices look like R34,800.

## Screens (v1)
Search (`#/`), school profile (`#/school/<id>`), true cost breakdown (`#/school/<id>/costs`), Saved (`#/saved`, ids in localStorage on this device only), Compare (`#/compare/<a>/<b>`), Privacy (`#/privacy`).

## Shareable preview
`python3 tools/build-preview.py dist/preview.html` bundles everything (CSS, JS, font, data) into one HTML file.

## Phone app (installable web app / PWA)
- `manifest.webmanifest` gives the app its name, icon and full-screen mode when added to the home screen.
- `sw.js` (service worker) saves the app files and the latest school data on the phone, so it opens offline. Bump `VERSION` in sw.js whenever app files change.
- Installing needs the app hosted on HTTPS (e.g. GitHub Pages, Netlify, Cloudflare Pages). On http://localhost it works for testing.
