import type { ExtractedEvent } from "./extraction/extract";
import { formatDate } from "./whatsapp/summary";

// Turns a held submission's Events into calendar Events. Returns what was published, with edit tokens.

export type Published = { title: string; startsAt: string; editToken: string; updated: boolean };

export type Held = { id: string; organizer_id: number; flyer_key: string; received_on: string };

// Publishes a held submission once, from the chat or the confirm page: whoever claims it first wins,
// a late second attempt gets null. `text` is the "✅ Ist online!" reply with the edit links.
export async function publishSubmission(
  env: Env,
  submission: Held,
  ready: ExtractedEvent[],
  skipped: ExtractedEvent[],
): Promise<{ published: Published[]; text: string } | null> {
  const { meta } = await env.DB.prepare("UPDATE submission SET status = 'published' WHERE id = ? AND status = 'pending'")
    .bind(submission.id)
    .run();
  if (meta.changes !== 1) return null;
  const published = await publishEvents(env.DB, submission, ready);

  const lines = published.map((p) => {
    const updated = p.updated ? " (aktualisiert, der alte Link gilt weiter)" : "";
    return `*${p.title}* – ${formatDate(p.startsAt.slice(0, 10), submission.received_on)}${updated}\nBearbeiten: ${editLink(env, p)}`;
  });
  if (skipped.length) lines.push(`Nicht eingetragen: ${skipped.map((e) => e.title).join(", ")}`);
  return { published, text: `✅ Ist online!\n\n${lines.join("\n\n")}\n\nDie Links sind privat – nicht weiterleiten.` };
}

export const editLink = (env: Env, p: Published) => `${env.PUBLIC_URL}/e/${p.editToken}`;

async function publishEvents(
  db: D1Database,
  submission: { organizer_id: number; flyer_key: string },
  events: ExtractedEvent[],
): Promise<Published[]> {
  const published: Published[] = [];
  for (const e of events) {
    const c = await columns(db, e);
    // A repost the Organizer called an update replaces their existing Event, which keeps its edit link.
    const updated =
      e.update_of &&
      (await db
        .prepare(
          `UPDATE event SET title = ?, type = ?, styles = ?, starts_at = ?, ends_at = ?, intro_class_at = ?, level = ?,
                            description = ?, price = ?, venue_id = ?, flyer_key = ?
           WHERE id = ? AND organizer_id = ? RETURNING edit_token`,
        )
        .bind(c.title, c.type, c.styles, c.starts_at, c.ends_at, c.intro_class_at, c.level, e.description || null, c.price, c.venue_id,
          submission.flyer_key, e.update_of, submission.organizer_id)
        .first<{ edit_token: string }>());
    if (updated) {
      published.push({ title: e.title, startsAt: c.starts_at, editToken: updated.edit_token, updated: true });
      continue;
    }
    const editToken = randomToken();
    await db
      .prepare(
        `INSERT INTO event (title, type, styles, starts_at, ends_at, intro_class_at, level, description, price,
                            venue_id, organizer_id, flyer_key, edit_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        c.title,
        c.type,
        c.styles,
        c.starts_at,
        c.ends_at,
        c.intro_class_at,
        c.level,
        e.description || null,
        c.price,
        c.venue_id,
        submission.organizer_id,
        submission.flyer_key,
        editToken,
      )
      .run();
    published.push({ title: e.title, startsAt: c.starts_at, editToken, updated: false });
  }
  return published;
}

// The event columns an Organizer sets, from the confirm or edit page's fields; creates the Venue if it's new.
export async function columns(db: D1Database, e: ExtractedEvent) {
  return {
    title: e.title,
    type: e.type,
    styles: JSON.stringify(e.styles),
    starts_at: `${e.start_date}T${e.start_time}`,
    ends_at: endsAt(e),
    intro_class_at: e.intro_class_time ? `${e.start_date}T${e.intro_class_time}` : null,
    level: e.level || null,
    price: e.price_text || null,
    venue_id: await venueFor(db, e),
  };
}

// An end time before the start time without an end date runs past midnight.
export function endsAt(e: ExtractedEvent): string | null {
  if (!e.end_time) return e.end_date ? `${e.end_date}T23:59` : null;
  if (e.end_date) return `${e.end_date}T${e.end_time}`;
  if (e.end_time > e.start_time) return `${e.start_date}T${e.end_time}`;
  const next = new Date(`${e.start_date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T${e.end_time}`;
}

// Matched by name, ignoring case and spacing; otherwise created as printed, with the coordinates
// the geocoder found for exactly these venue fields (`venue_guess`, see src/whatsapp/questions.ts).
// A Flyer that prints only an address gets a Venue named after that address.
async function venueFor(db: D1Database, e: ExtractedEvent): Promise<number> {
  const known = await findVenue(db, e);
  if (known) return known;
  const place = e.venue_guess?.query === venueQuery(e) ? e.venue_guess.place : null;
  const row = await db
    .prepare("INSERT INTO venue (name, address, lat, lng) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(venueName(e), venueAddress(e), place?.lat ?? null, place?.lng ?? null)
    .first<{ id: number }>();
  return row!.id;
}

// The known Venue an Event's place names, or null for a new or unknown place.
export async function findVenue(db: D1Database, e: ExtractedEvent): Promise<number | null> {
  const key = normalize(venueName(e));
  const { results } = await db.prepare("SELECT id, name FROM venue").all<{ id: number; name: string }>();
  return results.find((v) => normalize(v.name) === key)?.id ?? null;
}

// What the geocoder is asked for an Event's place; "" for an Event without one.
export const venueQuery = (e: ExtractedEvent) => [e.venue_name, e.venue_address, e.city].filter(Boolean).join(", ");

const venueAddress = (e: ExtractedEvent) => [e.venue_address, e.city].filter(Boolean).join(", ") || null;
const venueName = (e: ExtractedEvent) => e.venue_name || venueAddress(e) || UNKNOWN_VENUE;
export const UNKNOWN_VENUE = "(Ort unbekannt)";

export const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
