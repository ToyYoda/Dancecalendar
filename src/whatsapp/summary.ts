import { codeFlags } from "../extraction/checks";
import type { ExtractedEvent } from "../extraction/extract";

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

// Why an Event can't be published, or null if it can. Questions for a missing date or time come with ticket 21.
export function blocker(e: ExtractedEvent, receivedOn: string): string | null {
  if (!e.start_date) return "ohne Datum – wird nicht eingetragen";
  if (!e.start_time) return "ohne Uhrzeit – wird nicht eingetragen";
  if (e.start_date < receivedOn) return "liegt in der Vergangenheit – wird nicht eingetragen";
  // A guessed date this far ahead usually means last year's Flyer was forwarded.
  if (e.uncertain_fields.includes("start_date") && e.start_date > addDays(receivedOn, 183)) {
    return "fast ein Jahr entfernt – ist der Flyer vom letzten Jahr? Wird nicht eingetragen";
  }
  return null;
}

export const publishable = (e: ExtractedEvent, receivedOn: string) => blocker(e, receivedOn) === null;

export function summary(events: ExtractedEvent[], receivedOn: string, firstName: string | null): string {
  const count = events.length === 1 ? "1 Event" : `${events.length} Events`;
  const hello = firstName ? `Danke, ${firstName}!` : "Danke!";
  return [`${hello} Ich habe ${count} auf dem Flyer erkannt:`, ...events.map((e) => eventBlock(e, receivedOn))].join("\n\n");
}

function eventBlock(e: ExtractedEvent, receivedOn: string): string {
  const lines = [`*${e.title || "(ohne Titel)"}*`];
  const when = [formatDate(e.start_date, receivedOn), e.start_time].filter(Boolean).join(" · ");
  lines.push(e.intro_class_time ? `${when} (Einsteigerkurs ${e.intro_class_time})` : when);
  lines.push(`📍 ${[e.venue_name, e.venue_address, e.city].filter(Boolean).join(", ")}`);
  lines.push([TYPE_NAMES[e.type], e.styles.map((s) => STYLE_NAMES[s] ?? s).join(", ")].filter(Boolean).join(" · "));
  if (e.series.is_series) lines.push(`🔁 ${e.series.rule_text} – vorerst nur dieser Termin`);

  const why = blocker(e, receivedOn);
  if (why) {
    lines.push(`⚠️ ${why}`);
  } else {
    const uncertain = new Set([...e.uncertain_fields.map((f) => f.split(".")[0]), ...codeFlags(e, receivedOn)]);
    const names = [...new Set([...uncertain].map((f) => FIELD_NAMES[f]).filter(Boolean))];
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

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
