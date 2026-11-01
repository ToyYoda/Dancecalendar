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

// An Event can be published once it has a date and a start time; questions for the rest come with ticket 21.
export function publishable(event: ExtractedEvent): boolean {
  return event.start_date !== "" && event.start_time !== "";
}

export function summary(events: ExtractedEvent[], receivedOn: string, firstName: string | null): string {
  const count = events.length === 1 ? "1 Event" : `${events.length} Events`;
  const hello = firstName ? `Danke, ${firstName}!` : "Danke!";
  return [`${hello} Ich habe ${count} auf dem Flyer erkannt:`, ...events.map((e) => eventBlock(e, receivedOn))].join("\n\n");
}

function eventBlock(e: ExtractedEvent, receivedOn: string): string {
  const lines = [`*${e.title || "(ohne Titel)"}*`];
  const when = [formatDate(e.start_date), e.start_time].filter(Boolean).join(" · ");
  lines.push(e.intro_class_time ? `${when} (Einsteigerkurs ${e.intro_class_time})` : when);
  lines.push(`📍 ${[e.venue_name, e.venue_address, e.city].filter(Boolean).join(", ")}`);
  lines.push([TYPE_NAMES[e.type], e.styles.map((s) => STYLE_NAMES[s] ?? s).join(", ")].filter(Boolean).join(" · "));
  if (e.series.is_series) lines.push(`🔁 ${e.series.rule_text} – vorerst nur dieser Termin`);

  if (!publishable(e)) {
    lines.push(`⚠️ ${e.start_date ? "ohne Uhrzeit" : "ohne Datum"} – wird nicht eingetragen`);
  } else {
    const uncertain = new Set([...e.uncertain_fields.map((f) => f.split(".")[0]), ...codeFlags(e, receivedOn)]);
    const names = [...new Set([...uncertain].map((f) => FIELD_NAMES[f]).filter(Boolean))];
    if (names.length) lines.push(`⚠️ bitte prüfen: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}
