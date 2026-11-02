import { codeFlags, lastYearsFlyer } from "../extraction/checks";
import type { ExtractedEvent } from "../extraction/extract";
import { firstDates, heldRule, ruleWords, seriesLeads } from "../series";

// The chat summary of a Flyer's Events (variant C of prototypes/organizer-confirmation-prototype.html).

const FIELD_NAMES: Record<string, string> = {
  title: "Titel",
  type: "Art",
  styles: "Tanzstil",
  start_date: "Datum",
  start_time: "Uhrzeit",
  intro_class_time: "Einsteigerkurs",
  end_date: "Ende",
  end_time: "Ende",
  venue_name: "Ort",
  venue_address: "Adresse",
  city: "Stadt",
  price_text: "Preis",
  level: "Level",
};

const TYPE_NAMES = { party: "Party", workshop: "Workshop", festival: "Festival" };
const STYLE_NAMES: Record<string, string> = {
  salsa: "Salsa",
  bachata: "Bachata",
  kizomba: "Kizomba",
  urban_kiz: "Urban Kiz",
  west_coast_swing: "West Coast Swing",
};

// Why an Event can't be published, or null if it can. A missing start time is asked about in the chat
// first (questions.ts); a missing date is fixed on the confirm page.
export function blocker(e: ExtractedEvent, receivedOn: string): string | null {
  if (!e.start_date) return "ohne Datum – wird nicht eingetragen";
  if (!e.start_time) return "ohne Uhrzeit – wird nicht eingetragen";
  if (e.start_date < receivedOn) return "liegt in der Vergangenheit – wird nicht eingetragen";
  if (lastYearsFlyer(e, receivedOn)) {
    return "fast ein Jahr entfernt – ist der Flyer vom letzten Jahr? Wird nicht eingetragen";
  }
  return null;
}

export const publishable = (e: ExtractedEvent, receivedOn: string) => blocker(e, receivedOn) === null;

export function summary(events: ExtractedEvent[], receivedOn: string, firstName: string | null): string {
  const count = events.length === 1 ? "1 Event" : `${events.length} Events`;
  const hello = firstName ? `Danke, ${firstName}!` : "Danke!";
  const leads = seriesLeads(events);
  const blocks = events.map((e, i) => eventBlock(e, receivedOn, seriesLine(events, leads, i, receivedOn)));
  return [`${hello} Ich habe ${count} auf dem Flyer erkannt:`, ...blocks].join("\n\n");
}

// The Series rule in plain words with its first dates, on the first Event of a Series only.
function seriesLine(events: ExtractedEvent[], leads: number[], i: number, receivedOn: string): string | null {
  const e = events[i];
  if (e.update_of && e.update_series) return e.series.is_series ? "🔁 verlängert deine Serie" : "🔁 ändert nur diesen Termin deiner Serie";
  if (e.update_of) return "✏️ ersetzt dein bestehendes Event, der alte Link gilt weiter";
  if (!e.series.is_series || e.series_rule === null) return null;
  if (leads[i] !== i) return "🔁 gehört zur Serie oben";
  const rule = heldRule(e);
  if (!rule) return `🔁 ${e.series.rule_text} – vorerst nur dieser Termin`;
  if (rule.freq === "custom") return `🔁 ${ruleWords(rule)} – prüft der Admin, vorerst nur dieser Termin`;
  const own = events.filter((_, k) => leads[k] === i).map((o) => o.start_date);
  const dates = firstDates(rule, own).map((d) => formatDate(d, receivedOn)).join(", ");
  const words = e.type === "workshop" && e.registration_required ? `Kurs mit Anmeldung, ${lowerFirst(ruleWords(rule))}` : ruleWords(rule);
  return `🔁 ${words}: ${dates} …`;
}

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

// Fields the Organizer has answered a question about in the chat no longer need checking.
const ANSWERED_FIELDS = { date: ["start_date"], time: ["start_time"], venue: ["venue_name", "venue_address", "city"] };

// What the model or the code checks found uncertain, minus what the Organizer has answered.
export function uncertainFields(e: ExtractedEvent, receivedOn: string): Set<string> {
  const settled = new Set(Object.entries(ANSWERED_FIELDS).flatMap(([q, fields]) => (e.answered?.[q as "time"] ? fields : [])));
  return new Set([...e.uncertain_fields.map((f) => f.split(".")[0]), ...codeFlags(e, receivedOn)].filter((f) => !settled.has(f)));
}

function eventBlock(e: ExtractedEvent, receivedOn: string, series: string | null): string {
  const lines = [`*${e.title || "(ohne Titel)"}*`];
  const when = [formatDate(e.start_date, receivedOn), e.start_time].filter(Boolean).join(" · ");
  lines.push(e.intro_class_time ? `${when} (Einsteigerkurs ${e.intro_class_time})` : when);
  lines.push(`📍 ${[e.venue_name, e.venue_address, e.city].filter(Boolean).join(", ")}`);
  lines.push([TYPE_NAMES[e.type], e.styles.map((s) => STYLE_NAMES[s] ?? s).join(", ")].filter(Boolean).join(" · "));
  if (series) lines.push(series);

  const why = blocker(e, receivedOn);
  if (why) {
    lines.push(`⚠️ ${why}`);
  } else {
    const names = [...new Set([...uncertainFields(e, receivedOn)].map((f) => FIELD_NAMES[f]).filter(Boolean))];
    if (names.length) lines.push(`⚠️ bitte prüfen: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// "Sa 23.10.", with the year added when it isn't the year of `reference` (the day the Flyer arrived).
export function formatDate(iso: string, reference: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const year = String(y) === reference.slice(0, 4) ? "" : String(y);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${year}`;
}
