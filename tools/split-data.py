#!/usr/bin/env python3
"""One-time move from data/schools.json + data/admissions-kzn.json to the per-province layout
(Scaler note 1). Safe to re-run: it rebuilds data/index.json from whatever area files exist.

  data/index.json              list of areas (province), their files, school counts and map bounds
  data/countries/za.json       country settings (currency, terms per year, grades)
  data/schools/za-kzn.json     schools in KwaZulu-Natal (same shape as before)
  data/rules/za-kzn.json       admission rules for that province
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "data"
PROVINCES = {  # province name -> (area id, short name)
    "KwaZulu-Natal": ("za-kzn", "KZN"), "Gauteng": ("za-gp", "Gauteng"), "Western Cape": ("za-wc", "Western Cape"),
    "Eastern Cape": ("za-ec", "Eastern Cape"), "Free State": ("za-fs", "Free State"), "Limpopo": ("za-lp", "Limpopo"),
    "Mpumalanga": ("za-mp", "Mpumalanga"), "North West": ("za-nw", "North West"), "Northern Cape": ("za-nc", "Northern Cape"),
}

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

old = root / "schools.json"
if old.exists():
    by_area = {}
    for s in json.loads(old.read_text()):
        s.setdefault("country", "ZA")
        s.setdefault("emis", None)
        area = PROVINCES.get(s.get("province"), ("za-other", "Other"))[0]
        by_area.setdefault(area, []).append(s)
    for area, schools in by_area.items():
        write(root / "schools" / (area + ".json"), schools)
    old.rename(root / "schools.old.json")

old_rules = root / "admissions-kzn.json"
if old_rules.exists():
    write(root / "rules" / "za-kzn.json", json.loads(old_rules.read_text()))
    old_rules.rename(root / "admissions-kzn.old.json")

country = root / "countries" / "za.json"
if not country.exists():
    write(country, {
        "country": "ZA", "name": "South Africa", "currency": "ZAR", "symbol": "R", "locale": "en-ZA",
        "termsPerYear": 4, "budgetFilter": 3000,
        "grades": ["Gr 000", "Gr 00", "Gr R"] + ["Gr %d" % n for n in range(1, 13)],
    })

areas = []
for f in sorted((root / "schools").glob("*.json")):
    schools = json.loads(f.read_text())
    pts = [(s["lat"], s["lng"]) for s in schools if isinstance(s.get("lat"), (int, float)) and isinstance(s.get("lng"), (int, float))]
    province = schools[0].get("province") if schools else None
    short = PROVINCES.get(province, (None, province))[1]
    rules = root / "rules" / f.name
    areas.append({
        "id": f.stem, "country": "ZA", "province": province, "short": short,
        "file": "schools/" + f.name, "rules": ("rules/" + f.name) if rules.exists() else None,
        "schoolCount": len(schools),
        # School ids per area, so a saved school or a shared link loads only its own area's file.
        "ids": [s["id"] for s in schools],
        "bounds": [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)] if pts else None,
    })
write(root / "index.json", {"countries": {"ZA": "countries/za.json"}, "areas": areas})
print(json.dumps(areas, indent=1))
