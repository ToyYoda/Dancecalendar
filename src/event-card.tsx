import type { Child } from "hono/jsx";
import type { ExtractedEvent } from "./extraction/extract";
import { ruleFromValue, ruleOptions, ruleValue, type Rule } from "./series";

// The Event card shared by the confirm page (/c/<token>) and the edit page (/e/<token>):
// yellow = check, red = missing, plus warnings such as a likely duplicate.

export const TEXT_FIELDS = [
  "title",
  "start_date",
  "start_time",
  "end_time",
  "intro_class_time",
  "end_date",
  "venue_name",
  "venue_address",
  "city",
  "price_text",
  "level",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

const TYPES = { party: "Party", workshop: "Workshop", festival: "Festival" } as const;
const STYLES = { salsa: "Salsa", bachata: "Bachata", kizomba: "Kizomba", urban_kiz: "Urban Kiz", west_coast_swing: "West Coast Swing" };

export function fromForm(form: FormData, i: number, original: ExtractedEvent): ExtractedEvent {
  const e = { ...original };
  for (const f of TEXT_FIELDS) e[f] = String(form.get(`${f}.${i}`) ?? "").trim();
  const type = String(form.get(`type.${i}`));
  if (type in TYPES) e.type = type as ExtractedEvent["type"];
  e.styles = form.getAll(`styles.${i}`).map(String).filter((s) => s in STYLES);
  const repeat = form.get(`repeat.${i}`);
  if (repeat !== null) {
    e.series_rule = ruleFromValue(String(repeat), e.start_date, original.series_rule ?? null);
    e.answered = { ...e.answered, rule: true };
  }
  return e;
}

// Why a field keeps the Event from being published or saved, by field.
export function missing(e: ExtractedEvent, today: string): Partial<Record<TextField, string>> {
  const out: Partial<Record<TextField, string>> = {};
  if (!e.title) out.title = "fehlt – ohne Titel kein Eintrag";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start_date)) out.start_date = "fehlt – ohne Datum kein Eintrag";
  else if (e.start_date < today) out.start_date = "liegt in der Vergangenheit";
  if (!/^\d{2}:\d{2}$/.test(e.start_time)) out.start_time = "fehlt – ohne Uhrzeit kein Eintrag";
  return out;
}

// Without `include`, the card has no "eintragen" tick (the edit page). `hidden` fields aren't shown.
export function Card(props: {
  i: number;
  e: ExtractedEvent;
  include?: boolean;
  red: Partial<Record<TextField, string>>;
  yellow: Map<string, string>;
  warnings?: string[];
  hidden?: TextField[];
  venue?: string; // what the geocoder found for a new Venue
  series?: Child; // in place of the date's Series line: a RuleSelect or a note
}) {
  const { i, e, red, yellow } = props;
  const field = (name: TextField, label: string, type = "text", required = false) => {
    if (props.hidden?.includes(name)) return null;
    const why = red[name] ?? yellow.get(name);
    return (
      <div>
        <label for={`${name}.${i}`}>{label}</label>
        <input
          id={`${name}.${i}`}
          name={`${name}.${i}`}
          type={type}
          value={e[name]}
          class={red[name] ? "miss" : yellow.has(name) ? "unc" : undefined}
          data-required={required ? "" : undefined}
        />
        {why && <div class={red[name] ? "why r" : "why"}>{red[name] ? why : `⚠️ ${why}`}</div>}
      </div>
    );
  };
  return (
    <fieldset class={props.include === false ? "card dropped" : "card"}>
      <legend>
        <span>{e.title || "(ohne Titel)"}</span>
        {props.include !== undefined && (
          <label>
            <input type="checkbox" name="include" value={String(i)} checked={props.include} /> eintragen
          </label>
        )}
      </legend>
      {props.warnings?.map((w) => <p class="warn">⚠️ {w}</p>)}
      {field("title", "Titel", "text", true)}
      <div class="row">
        <div>
          <label for={`type.${i}`}>Art der Veranstaltung</label>
          <select id={`type.${i}`} name={`type.${i}`} class={yellow.has("type") ? "unc" : undefined}>
            {Object.entries(TYPES).map(([value, label]) => (
              <option value={value} selected={e.type === value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {field("start_date", "Datum", "date", true)}
      </div>
      <div class="row">
        {field("start_time", "Beginn", "time", true)}
        {field("end_time", "Ende", "time")}
      </div>
      <div class="row">
        {field("intro_class_time", "Einsteigerkurs", "time")}
        {field("end_date", "Bis (mehrtägig)", "date")}
      </div>
      {props.series}
      {field("venue_name", "Ort")}
      {field("venue_address", "Adresse")}
      {field("city", "Stadt")}
      {props.venue && <p class="series">📍 {props.venue}</p>}
      <div class={yellow.has("styles") ? "styles unc" : "styles"}>
        <span>Tänze</span>
        {Object.entries(STYLES).map(([value, label]) => (
          <label>
            <input type="checkbox" name={`styles.${i}`} value={value} checked={e.styles.includes(value)} /> {label}
          </label>
        ))}
      </div>
      <div class="row">
        {field("price_text", "Preis")}
        {field("level", "Level")}
      </div>
    </fieldset>
  );
}

// The "Wiederholung" select of a Series' first Event (confirm page) or of a Series (Series page).
// `none` labels the option that publishes just this date; the Series page has none.
export function RuleSelect(props: { i: number; e: ExtractedEvent; rule: Rule | null; none?: string; note?: string }) {
  const { i, e } = props;
  const value = ruleValue(props.rule);
  return (
    <div>
      <label for={`repeat.${i}`}>Wiederholung{e.series.rule_text ? ` (Flyer: „${e.series.rule_text}“)` : ""}</label>
      <select id={`repeat.${i}`} name={`repeat.${i}`} class={props.note ? "unc" : undefined}>
        {props.none && (
          <option value="none" selected={value === "none"}>
            {props.none}
          </option>
        )}
        {ruleOptions(e.start_date, props.rule).map((o) => (
          <option value={o.value} selected={o.value === value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.note && <div class="why">⚠️ {props.note}</div>}
    </div>
  );
}

// In the site's look (src/site.tsx): its tokens, with yellow (--warm) to check and red (--off) for what's missing.
export const CARD_CSS = `
  .flyer { display:block; max-width:100%; max-height:45vh; margin:0 auto 16px; border-radius:var(--r-sm, 8px); box-shadow:0 0 0 1px var(--line, #e4dfd8); }
  .card { border:0; border-radius:var(--r, 10px); padding:16px 18px 18px; margin:16px 0; background:var(--card, #fff); box-shadow:var(--shadow, none), 0 0 0 1px var(--line, #e4dfd8); min-width:0; }
  .card.dropped { opacity:.45; }
  .card legend { float:left; display:flex; gap:16px; justify-content:space-between; align-items:center; width:100%; margin-bottom:6px; padding:0; font:500 19px/1.3 var(--sans, inherit); box-sizing:border-box; }
  .card legend + * { clear:both; }
  .card legend label { font-weight:400; margin:0; color:inherit; font-size:15px; display:flex; gap:6px; align-items:center; }
  .card label, .styles > span { display:block; font-size:14px; font-weight:500; color:var(--mute, #6f6861); margin-top:12px; margin-bottom:4px; }
  .card input:not([type=checkbox]), .card select { width:100%; box-sizing:border-box; height:44px; border:1px solid rgb(31 48 56 / .18); border-radius:var(--r-sm, 6px); padding:0 12px; font:400 16px var(--sans, inherit); background:var(--card, #fff); color:var(--ink, inherit); }
  .card input:focus, .card select:focus { outline:2px solid var(--accent, #c2185b); outline-offset:0; border-color:transparent; }
  .card input[type=checkbox] { width:18px; height:18px; accent-color:var(--accent, #c2185b); }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .row > * { min-width:0; }
  .styles { margin-top:4px; }
  .styles label { display:inline-flex; gap:6px; align-items:center; margin:4px 14px 4px 0; color:var(--ink, inherit); font-size:15px; font-weight:400; }
  .styles.unc { background:var(--warm-tint, #fff8e1); border-radius:var(--r-sm, 6px); padding:2px 8px 6px; }
  .card :is(input, select).unc, .unc-key { background:var(--warm-tint, #fff8e1); border-color:#d9a400; }
  .card :is(input, select).miss, .miss-key { background:var(--off-tint, #fde2e2); border-color:var(--off, #d33); }
  .why { font-size:14px; color:var(--warm, #8a6d00); margin-top:4px; }
  .why.r { color:var(--off, #a30000); }
  .warn { font-size:15px; background:var(--warm-tint, #fff8e1); color:var(--warm, inherit); border-radius:var(--r-sm, 6px); padding:10px 14px; margin:6px 0; }
  .series { font-size:15px; margin:10px 0 0; color:var(--mute, inherit); }
  .publish { width:100%; height:48px; font:500 16px var(--sans, inherit); border:0; border-radius:99px; background:var(--accent, #c2185b); color:#fff; cursor:pointer; transition:background .15s, transform .15s; }
  .publish:hover { background:var(--accent-ink, #a0144b); }
  .publish:active { transform:scale(.98); }
  .publish:disabled { background:var(--hair, #ccc); color:var(--mute, #666); cursor:default; }
  .shown-as input { width:100%; box-sizing:border-box; height:44px; border:1px solid rgb(31 48 56 / .18); border-radius:var(--r-sm, 6px); padding:0 12px; font:inherit; }
  .reject { width:100%; height:44px; margin-top:12px; font:500 15px var(--sans, inherit); border:1px solid rgb(163 39 27 / .35); border-radius:99px; background:var(--card, #fff); color:var(--off, #a30000); cursor:pointer; }
  .reject:hover { background:var(--off-tint, #fde2e2); }
  .hint { font-size:14px; color:var(--mute, #6f6861); }
  @media (max-width:420px) { .row { grid-template-columns:1fr; gap:0; } }
`;
