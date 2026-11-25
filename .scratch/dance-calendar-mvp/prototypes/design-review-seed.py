"""PROTOTYPE, wipe me: seeds the LOCAL dev database with the 17 sample Flyers for the design review
(issues/29-design-review-and-desktop.md). Dates are moved into the next two weeks so the feed is full.
Run from the repo root:  python .scratch/dance-calendar-mvp/prototypes/design-review-seed.py
Never run against --remote."""
import json, pathlib, random, subprocess, datetime

ROOT = pathlib.Path(".scratch/dance-calendar-mvp")
GT = json.load(open(ROOT / "eval/ground_truth.json", encoding="utf8"))["flyers"]
RESULTS = ROOT / "eval/results/claude-sonnet-5-5@medium@v2"
CITY = {"kassel": (51.315, 9.49), "göttingen": (51.535, 9.93), "goettingen": (51.535, 9.93)}
random.seed(29)
today = datetime.date.today()

def q(s):
    return "NULL" if s is None or s == "" else "'" + str(s).replace("�", "").replace("'", "''") + "'"

sql = ["DELETE FROM event;", "DELETE FROM series;", "DELETE FROM submission;", "DELETE FROM venue;", "DELETE FROM organizer;"]
venues, organizers, n = {}, {}, 0
for fid, gt in GT.items():
    out = json.load(open(RESULTS / f"{fid}.json", encoding="utf8"))["output"]
    if not out.get("is_event_flyer"):
        continue
    key = f"flyers/proto-{fid}.jpeg"
    subprocess.run(["npx", "wrangler", "r2", "object", "put", f"dancecalendar-flyers/{key}", "--file", str(ROOT / "assets/flyers" / gt["file"]),
                    "--content-type", "image/jpeg", "--local"], check=True, shell=True, capture_output=True)
    name = out.get("display_name_on_flyer") or "Community"
    if name not in organizers:
        organizers[name] = len(organizers) + 1
        sql.append(f"INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES ({organizers[name]}, '49000{organizers[name]:04d}', {q(name)}, 'Proto');")
    day0 = random.randint(0, 6)
    repeats = [0, 7, 14] if random.random() < 0.7 else [0, 9]  # most look like weekly Series
    for i, e in [(i + r, e) for r in repeats for i, e in enumerate(out["events"][:3])]:
        if e.get("type") == "festival" and i > 2:
            continue
        vname = e.get("venue_name") or "Ort unbekannt"
        if vname not in venues:
            lat, lng = CITY.get((e.get("city") or "").lower(), (None, None))
            jitter = lambda x: None if x is None else x + random.uniform(-0.02, 0.02)
            venues[vname] = len(venues) + 1
            sql.append(f"INSERT INTO venue (id, name, address, lat, lng) VALUES ({venues[vname]}, {q(vname)}, {q(e.get('venue_address'))}, "
                       f"{jitter(lat) if lat else 'NULL'}, {jitter(lng) if lng else 'NULL'});")
        d = today + datetime.timedelta(days=day0 + i)
        start = e.get("start_time") or "21:00"
        intro = f"'{d}T{e['intro_class_time']}'" if e.get("intro_class_time") else "NULL"
        ends = "NULL"
        if e.get("type") == "festival":
            ends = f"'{d + datetime.timedelta(days=2)}T02:00'"
        n += 1
        sql.append(
            "INSERT INTO event (id, title, type, styles, starts_at, ends_at, intro_class_at, level, description, price, venue_id, organizer_id, flyer_key, edit_token) VALUES "
            f"({n}, {q(e['title'])}, {q(e['type'] if e['type'] in ('party','workshop','festival') else 'party')}, {q(json.dumps(e.get('styles') or []))}, "
            f"'{d}T{start}', {ends}, {intro}, {q(e.get('level'))}, {q(e.get('description'))}, {q(e.get('price_text'))}, {venues[vname]}, {organizers[name]}, "
            f"'{key}', 'proto-{n}');")

path = pathlib.Path(".wrangler/proto-seed.sql")
path.write_text("\n".join(sql), encoding="utf8")
subprocess.run(["npx", "wrangler", "d1", "execute", "dancecalendar", "--local", "--file", str(path)], check=True, shell=True)
print(f"seeded {n} Events from {len(GT)} Flyers")
