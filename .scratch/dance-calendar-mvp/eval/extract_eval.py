"""Throwaway eval for "Extraction accuracy on the sample Flyers".

  python extract_eval.py run [--models claude-haiku-5-5,claude-sonnet-5-5] [--effort medium] [--only F01,F02]
  python extract_eval.py score

`run` calls the API once per Flyer and model and caches the raw response in
results/<model>/<flyer>.json (skips cached ones). `score` is offline and
writes results/report.md. Raw results are git-ignored: they echo Flyer text.
"""

import argparse
import base64
import datetime as dt
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
FLYERS = HERE.parent / "assets" / "flyers"
RESULTS = HERE / "results"
GT = json.loads((HERE / "ground_truth.json").read_text(encoding="utf-8"))["flyers"]
MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"]
PROMPT_VERSION = "v2"  # v1: first run (no save-the-date rule, year inference flagged)
PRICES = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0)}  # $/MTok in, out

STYLES = ["salsa", "bachata", "kizomba", "urban_kiz", "west_coast_swing"]
KEY_FIELDS = {"start_date", "start_time", "venue_name"}

EVENT = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "type": {"type": "string", "enum": ["party", "workshop", "festival"]},
        "styles": {"type": "array", "items": {"type": "string", "enum": STYLES}},
        "start_date": {"type": "string"},
        "weekday_on_flyer": {"type": "string"},
        "start_time": {"type": "string"},
        "intro_class_time": {"type": "string"},
        "end_date": {"type": "string"},
        "end_time": {"type": "string"},
        "venue_name": {"type": "string"},
        "venue_address": {"type": "string"},
        "city": {"type": "string"},
        "price_text": {"type": "string"},
        "level": {"type": "string"},
        "registration_required": {"type": "boolean"},
        "description": {"type": "string"},
        "series": {
            "type": "object",
            "properties": {
                "is_series": {"type": "boolean"},
                "rule_text": {"type": "string"},
                "frequency": {"type": "string", "enum": ["none", "weekly", "every_n_weeks", "nth_weekday_of_month", "unclear"]},
                "explicit_dates": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["is_series", "rule_text", "frequency", "explicit_dates"],
            "additionalProperties": False,
        },
        "uncertain_fields": {"type": "array", "items": {"type": "string"}},
        "notes": {"type": "string"},
    },
    "additionalProperties": False,
}
EVENT["required"] = list(EVENT["properties"])

SCHEMA = {
    "type": "object",
    "properties": {
        "is_event_flyer": {"type": "boolean"},
        "flyer_language": {"type": "string", "enum": ["de", "en", "es", "other"]},
        "display_name_on_flyer": {"type": "string"},
        "events": {"type": "array", "items": EVENT},
    },
    "required": ["is_event_flyer", "flyer_language", "display_name_on_flyer", "events"],
    "additionalProperties": False,
}

SYSTEM = """You extract partner-dance Events (Salsa, Bachata, Kizomba, Urban Kiz, West Coast Swing and similar) from a Flyer image that an Organizer sent to a calendar bot. Return every dated Event a Dancer would expect to see in a calendar.

Rules:
- type: "party" for a dance night or social; "workshop" for a class or course session; "festival" for a multi-day event with its own programme (one Event, end_date set, no inner Events).
- A class or workshop right before a party at the same place is NOT its own Event: it is the party's intro_class_time, even when the Flyer's headline is the workshop.
- A course (several sessions, registration) is a workshop with registration_required true; different levels in the same slot are separate Events.
- styles: only from the enum; leave empty if none of them is named. Other styles go in description.
- Dates: ISO yyyy-mm-dd. If the year is not printed, pick the next occurrence on or after the date the Flyer was received. weekday_on_flyer is the weekday as printed, "" if none.
- start_time: when the party/workshop itself starts (HH:MM, 24 h). "" if not printed; never guess. A dated Event without a time (e.g. a save-the-date) is still returned, with start_time "".
- Unknown values are "" (or [] / false), never invented.
- Series: if the Flyer states a repeating rule, set series and copy rule_text verbatim; frequency "unclear" if the wording allows several readings (e.g. "jeden 2. Mittwoch" = every other Wednesday or 2nd Wednesday of the month?). If the Flyer lists several dates, return one Event per listed date. If a Series has no printed date, return one Event with start_date "".
- venue_name as printed (a name, logo or @handle); venue_address and city only as printed or certain.
- Text fields are kept in the Flyer's language, untranslated.
- uncertain_fields: list every field name whose value you inferred rather than read, or could not read clearly. Do not list start_date just because the year was inferred from the received date. notes: one short sentence why.
- If the image is not an event flyer, set is_event_flyer false and return no events."""


def run(models, effort, only):
    import anthropic

    client = anthropic.Anthropic()
    for model in models:
        out_dir = RESULTS / f"{model}@{effort}@{PROMPT_VERSION}"
        out_dir.mkdir(parents=True, exist_ok=True)
        for fid, flyer in GT.items():
            if only and fid not in only:
                continue
            out = out_dir / f"{fid}.json"
            if out.exists():
                continue
            data = base64.standard_b64encode((FLYERS / flyer["file"]).read_bytes()).decode()
            started = time.monotonic()
            try:
                resp = client.messages.create(
                    model=model,
                    max_tokens=16000,
                    system=SYSTEM,
                    output_config={"effort": effort, "format": {"type": "json_schema", "schema": SCHEMA}},
                    messages=[{"role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
                        {"type": "text", "text": f"Flyer received on {flyer['received']}."},
                    ]}],
                )
            except anthropic.APIStatusError as e:
                print(f"{model} {fid}: HTTP {e.status_code} {e.message}", file=sys.stderr)
                continue
            seconds = time.monotonic() - started
            text = next((b.text for b in resp.content if b.type == "text"), "")
            try:
                parsed, valid = json.loads(text), True
            except json.JSONDecodeError:
                parsed, valid = None, False
            record = {
                "model": model, "effort": effort, "stop_reason": resp.stop_reason, "valid": valid and resp.stop_reason == "end_turn",
                "seconds": round(seconds, 1), "input_tokens": resp.usage.input_tokens, "output_tokens": resp.usage.output_tokens,
                "output": parsed,
            }
            out.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"{model} {fid}: {resp.stop_reason}, {seconds:.1f}s, {len((parsed or {}).get('events', []))} events")


# ---------- scoring ----------

WEEKDAYS = {"mo": 0, "di": 1, "mi": 2, "do": 3, "fr": 4, "sa": 5, "so": 6,
            "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
            "lun": 0, "mar": 1, "mié": 2, "mie": 2, "jue": 3, "vie": 4, "sáb": 5, "sab": 5, "dom": 6}


def code_flags(ev, received):
    """The checks the app adds on top of the model's own flags."""
    flags = set()
    if not ev.get("start_time"):
        flags.add("start_time")
    if not ev.get("start_date"):
        flags.add("start_date")
    else:
        try:
            d = dt.date.fromisoformat(ev["start_date"])
            if d < dt.date.fromisoformat(received) or d > dt.date.fromisoformat(received) + dt.timedelta(days=365):
                flags.add("start_date")
            wd = ev.get("weekday_on_flyer", "").strip().lower().rstrip(".")
            for key, num in WEEKDAYS.items():
                if wd.startswith(key) and d.weekday() != num:
                    flags.add("start_date")
                    break
        except ValueError:
            flags.add("start_date")
    return flags


def expand(events):
    """One row per calendar date: listed Series dates become their own Events."""
    rows = []
    returned = {ev.get("start_date") for ev in events}
    for ev in events:
        rows.append(ev)
        for extra in ev.get("series", {}).get("explicit_dates", []):
            if extra and extra not in returned:
                rows.append({**ev, "start_date": extra, "_expanded": True})
    seen, unique = set(), []
    for ev in rows:
        key = (ev.get("start_date"), ev.get("type"), ev.get("start_time"), ev.get("venue_name"))
        if key not in seen:
            seen.add(key)
            unique.append(ev)
    return unique


def score_flyer(fid, record):
    gt = GT[fid]
    res = {"fid": fid, "valid": record["valid"], "fields": 0, "wrong": [], "silent": [], "false_alarms": 0, "spurious": 0, "missed": 0}
    if not record["valid"]:
        res["count_ok"] = False
        res["missed"] = len(gt["events"])
        return res
    preds = expand(record["output"]["events"])
    res["count_ok"] = len(preds) == len(gt["events"])
    free = list(preds)
    for want in gt["events"]:
        if gt.get("undated_series"):
            cands = free
        else:
            cands = [p for p in free if p.get("start_date") == want["date"]]
        cands.sort(key=lambda p: p.get("type") != want["type"])
        if not cands:
            res["missed"] += 1
            continue
        got = cands[0]
        free.remove(got)
        flagged = {f.split(".")[0] for f in got.get("uncertain_fields", [])} | code_flags(got, gt["received"])
        checks = {}
        if gt.get("undated_series"):
            checks["start_date"] = (got.get("start_date") == "" or "start_date" in flagged)
        if want["start_time"] is not None:
            checks["start_time"] = got.get("start_time", "") in want["start_time"]
        if want["venue"] is not None:
            hay = (got.get("venue_name", "") + " " + got.get("venue_address", "")).lower()
            checks["venue_name"] = any(tok in hay for tok in want["venue"])
        checks["type"] = got.get("type") == want["type"]
        for field, ok in checks.items():
            res["fields"] += 1
            caught = field in flagged or (field == "venue_name" and "venue_address" in flagged)
            if not ok:
                res["wrong"].append(field)
                if not caught:
                    res["silent"].append(field)
            elif caught and field in KEY_FIELDS and field != "start_date" and got.get(field, "") != "":
                res["false_alarms"] += 1
    res["spurious"] = len(free)
    res["key_flagged"] = any(
        KEY_FIELDS & ({f.split(".")[0] for f in ev.get("uncertain_fields", [])} | code_flags(ev, gt["received"]))
        for ev in preds
    )
    return res


def load(run_name):
    out = {}
    for fid in GT:
        p = RESULTS / run_name / f"{fid}.json"
        if p.exists():
            out[fid] = json.loads(p.read_text(encoding="utf-8"))
    return out


def summarize(name, scored, records):
    n = len(scored)
    fields = sum(s["fields"] for s in scored)
    wrong = sum(len(s["wrong"]) for s in scored)
    silent = sum(len(s["silent"]) for s in scored)
    gt_events = sum(len(GT[s["fid"]]["events"]) for s in scored)
    clean = sum(1 for s in scored if s["count_ok"] and not s["wrong"] and not s["missed"])
    cost = sum(r["input_tokens"] * PRICES[r["model"]][0] / 1e6 + r["output_tokens"] * PRICES[r["model"]][1] / 1e6 for r in records)
    secs = sorted(r["seconds"] for r in records)
    p50 = secs[len(secs) // 2] if secs else 0
    return (f"| {name} | {n} | {sum(s['count_ok'] for s in scored)}/{n} | {gt_events - sum(s['missed'] for s in scored)}/{gt_events} "
            f"| {sum(s['spurious'] for s in scored)} | {fields - wrong}/{fields} | {wrong - silent}/{wrong} | {silent} "
            f"| {clean}/{n} | ${cost:.3f} | {p50:.1f}s / {secs[-1] if secs else 0:.1f}s |")


def score():
    lines = ["# Extraction eval results", "",
             f"Scored {dt.date.today().isoformat()} against `ground_truth.json`. Fields checked per matched Event: start_time, venue, type (and the undated Series' date on F02). "
             "*Caught* = the wrong field was in `uncertain_fields` or tripped a code check (empty time, weekday mismatch, date in the past or > 1 year ahead). "
             "*Silent* = wrong and not highlighted: what an Organizer would miss.", "",
             "| Model | Flyers | Event count right | GT Events found | Spurious Events | Fields right | Wrong ones caught | Silent errors | Fully clean Flyers | Cost | Latency p50 / max |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    per_model = {}
    for run_dir in sorted(p for p in RESULTS.iterdir() if p.is_dir()):
        recs = load(run_dir.name)
        if not recs:
            continue
        scored = [score_flyer(fid, r) for fid, r in recs.items()]
        per_model[run_dir.name] = (recs, {s["fid"]: s for s in scored})
        lines.append(summarize(run_dir.name, scored, list(recs.values())))
    escalations = []
    for name, (h_recs, h) in per_model.items():
        model, _, version = name.split("@")
        sonnet = f"{MODELS[1]}@medium@{version}"
        if model != MODELS[0] or sonnet not in per_model:
            continue
        s_recs, s = per_model[sonnet]
        common = [f for f in h if f in s]
        casc, casc_recs, n_esc = [], [], 0
        for f in common:
            escalate = not h[f]["valid"] or h[f]["key_flagged"]
            n_esc += escalate
            casc.append(s[f] if escalate else h[f])
            casc_recs += [h_recs[f], s_recs[f]] if escalate else [h_recs[f]]
        lines.append(summarize(f"{name} → Sonnet on key flag", casc, casc_recs))
        escalations.append(f"{name} cascade escalated {n_esc}/{len(common)} Flyers to Sonnet.")
    lines += [""] + escalations
    lines += ["", "## Per Flyer", "", "| Flyer | " + " | ".join(per_model) + " |", "|---|" + "---|" * len(per_model)]
    for fid in GT:
        cells = []
        for model, (_, sc) in per_model.items():
            r = sc.get(fid)
            if not r:
                cells.append("–")
                continue
            bits = ["ok" if r["count_ok"] else "count✗"]
            if r["missed"]:
                bits.append(f"missed {r['missed']}")
            if r["spurious"]:
                bits.append(f"+{r['spurious']}")
            if r["wrong"]:
                bits.append("wrong " + ",".join(f + ("" if f in r["silent"] else "⚑") for f in r["wrong"]))
            cells.append("; ".join(bits))
        lines.append(f"| {fid} | " + " | ".join(cells) + " |")
    lines += ["", "⚑ = wrong but highlighted to the Organizer."]
    (RESULTS / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "score"])
    ap.add_argument("--models", default=",".join(MODELS))
    ap.add_argument("--effort", default="medium")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    if a.cmd == "run":
        run(a.models.split(","), a.effort, set(filter(None, a.only.split(","))))
    else:
        score()
