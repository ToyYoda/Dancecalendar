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
          <label for={`type.${i}`}>Art</label>
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
        <span>Tanzstile</span>
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

export const CARD_CSS = `
  .flyer { display: block; max-width: 100%; max-height: 45vh; margin: 0 auto 1rem; border-radius: 8px; }
  .card { border: 1px solid #e4dfd8; border-radius: 10px; padding: .75rem; margin: 1rem 0; }
  .card.dropped { opacity: .45; }
  .card legend { display: flex; gap: 1rem; justify-content: space-between; width: 100%; font-weight: bold; padding: 0 .25rem; box-sizing: border-box; }
  .card legend label { font-weight: normal; margin: 0; color: inherit; font-size: 1rem; }
  .card label, .styles > span { display: block; font-size: .8rem; color: #6f6861; margin-top: .5rem; }
  .card input:not([type=checkbox]), .card select { width: 100%; box-sizing: border-box; border: 1px solid #e4dfd8; border-radius: 6px; padding: .4rem .5rem; font: inherit; background: #fff; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .styles label { display: inline-block; margin-right: .75rem; color: inherit; font-size: .9rem; }
  .styles.unc { background: #fff8e1; border-radius: 6px; padding: 0 .25rem .25rem; }
  .card :is(input, select).unc, .unc-key { background: #fff8e1; border-color: #e0b100; }
  .card :is(input, select).miss, .miss-key { background: #fde2e2; border-color: #d33; }
  .why { font-size: .8rem; color: #8a6d00; }
  .why.r { color: #a30000; }
  .warn { font-size: .9rem; background: #fff8e1; border-radius: 6px; padding: .4rem .5rem; margin: .25rem 0; }
  .series { font-size: .9rem; margin: .5rem 0 0; }
  .publish { width: 100%; padding: .75rem; font: inherit; font-weight: bold; border: 0; border-radius: 8px; background: #c2185b; color: #fff; }
  .publish:disabled { background: #ccc; color: #666; }
  .shown-as input { width: 100%; box-sizing: border-box; border: 1px solid #e4dfd8; border-radius: 6px; padding: .4rem .5rem; font: inherit; }
  .reject { width: 100%; margin-top: .75rem; padding: .6rem; font: inherit; border: 1px solid #a30000; border-radius: 8px; background: #fff; color: #a30000; }
  .hint { font-size: .85rem; color: #6f6861; }
`;
