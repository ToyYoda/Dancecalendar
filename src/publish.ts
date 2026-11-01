import type { ExtractedEvent } from "./extraction/extract";

// Turns a held submission's Events into calendar Events. Returns what was published, with edit tokens.

export type Published = { title: string; startsAt: string; editToken: string };

export async function publishEvents(
  db: D1Database,
  submission: { organizer_id: number; flyer_key: string },
  events: ExtractedEvent[],
): Promise<Published[]> {
  const published: Published[] = [];
  for (const e of events) {
    const venueId = await venueFor(db, e);
    const startsAt = `${e.start_date}T${e.start_time}`;
    const editToken = randomToken();
    await db
      .prepare(
        `INSERT INTO event (title, type, styles, starts_at, ends_at, intro_class_at, level, description, price,
                            venue_id, organizer_id, flyer_key, edit_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        e.title,
        e.type,
        JSON.stringify(e.styles),
        startsAt,
        endsAt(e),
        e.intro_class_time ? `${e.start_date}T${e.intro_class_time}` : null,
        e.level || null,
        e.description || null,
        e.price_text || null,
        venueId,
        submission.organizer_id,
        submission.flyer_key,
        editToken,
      )
      .run();
    published.push({ title: e.title, startsAt, editToken });
  }
  return published;
}

// An end time before the start time without an end date runs past midnight.
function endsAt(e: ExtractedEvent): string | null {
  if (!e.end_time) return e.end_date ? `${e.end_date}T23:59` : null;
  if (e.end_date) return `${e.end_date}T${e.end_time}`;
  if (e.end_time > e.start_time) return `${e.start_date}T${e.end_time}`;
  const next = new Date(`${e.start_date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T${e.end_time}`;
}

// Matched by name, ignoring case and spacing; otherwise created as printed (geocoding comes with ticket 21).
// A Flyer that prints only an address gets a Venue named after that address.
async function venueFor(db: D1Database, e: ExtractedEvent): Promise<number> {
  const address = [e.venue_address, e.city].filter(Boolean).join(", ") || null;
  const name = e.venue_name || address || "(Ort unbekannt)";
  const key = normalize(name);
  const { results } = await db.prepare("SELECT id, name FROM venue").all<{ id: number; name: string }>();
  const known = results.find((v) => normalize(v.name) === key);
  if (known) return known.id;
  const row = await db
    .prepare("INSERT INTO venue (name, address) VALUES (?, ?) RETURNING id")
    .bind(name, address)
    .first<{ id: number }>();
  return row!.id;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
