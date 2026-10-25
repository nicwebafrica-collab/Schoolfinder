#!/usr/bin/env python3
"""Bundle the app into one self-contained HTML file (CSS, JS, font and data inlined).
Used for the shareable preview. Run: python3 tools/build-preview.py <output.html>"""
import base64, json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist" / "preview.html")

font = base64.b64encode((root / "fonts/plus-jakarta-sans-latin.woff2").read_bytes()).decode()
css = (root / "styles.css").read_text().replace(
    "url(fonts/plus-jakarta-sans-latin.woff2)", "url(data:font/woff2;base64," + font + ")")
# Let an explicit light/dark choice from the host override the system setting.
m = re.search(r"@media \(prefers-color-scheme: dark\) \{\s*:root \{(.*?)\}\s*\}", css, re.S)
if m:
    dark = m.group(1)
    css = css.replace(m.group(0),
        "@media (prefers-color-scheme: dark) { :root:not([data-theme=\"light\"]) {" + dark + " color-scheme: dark; } }\n"
        ":root[data-theme=\"dark\"] {" + dark + " color-scheme: dark; }")

# Every data file is embedded, keyed by its path under data/, so the preview needs no downloads.
embedded = {}
for f in sorted((root / "data").rglob("*.json")):
    rel = f.relative_to(root / "data").as_posix()
    if not rel.endswith(".old.json"):
        embedded[rel] = json.loads(f.read_text())
data_js = ("window.EMBEDDED_DATA = " + json.dumps(embedded) + ";").replace("</", "<\\/")

html = f"""<title>School Finder</title>
<style>
{css}
</style>
<main id="app"></main>
<nav id="nav" class="bottom-nav" aria-label="Main"></nav>
<script>{data_js}</script>
<script>{(root / "js/logic.js").read_text()}</script>
<script>{(root / "js/admissions.js").read_text()}</script>
<script>{(root / "js/places.js").read_text()}</script>
<script>{(root / "js/app.js").read_text()}</script>
"""
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
print("wrote", out, len(html), "bytes")
