import type { ExtractedEvent } from "./extraction/extract";
import { endsAt, findVenue, UNKNOWN_VENUE } from "./publish";
import { formatDate } from "./whatsapp/summary";

// Likely duplicates: another Event at the same Venue whose time overlaps. Warned about on publish and
// on edit, never blocked, whoever posted the other Event. Events from the same Flyer don't count
// (a Workshop before its Party), nor do cancelled ones.

type Slot = { venueId: number; startsAt: string; endsAt: string | null; flyerKey: string | null; eventId: number | null };

const ASSUMED_HOURS = 2; // an Event without an end time
const LONGEST_DAYS = 7; // how far back an overlapping Event can start (a Festival)

// For an Event read from a Flyer, before it's published.
export async function duplicatesOfExtracted(db: D1Database, e: ExtractedEvent, flyerKey: string): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start_date) || !/^\d{2}:\d{2}$/.test(e.start_time)) return [];
  const venueId = await findVenue(db, e);
  if (!venueId || !(e.venue_name || e.venue_address || e.city)) return [];
  return warnings(db, { venueId, startsAt: `${e.start_date}T${e.start_time}`, endsAt: endsAt(e), flyerKey, eventId: null });
}

// For a published Event.
export async function duplicatesOfEvent(db: D1Database, eventId: number): Promise<string[]> {
  const e = await db
    .prepare(
      `SELECT e.venue_id, e.starts_at, e.ends_at, e.flyer_key, v.name
       FROM event e JOIN venue v ON v.id = e.venue_id WHERE e.id = ?`,
    )
    .bind(eventId)
    .first<{ venue_id: number; starts_at: string; ends_at: string | null; flyer_key: string | null; name: string }>();
  if (!e || e.name === UNKNOWN_VENUE) return [];
  return warnings(db, { venueId: e.venue_id, startsAt: e.starts_at, endsAt: e.ends_at, flyerKey: e.flyer_key, eventId });
}

async function warnings(db: D1Database, slot: Slot): Promise<string[]> {
  const end = slot.endsAt ?? plusHours(slot.startsAt, ASSUMED_HOURS);
  const { results } = await db
    .prepare(
      `SELECT e.title, e.starts_at, e.ends_at, COALESCE(o.display_name, e.shown_as) AS posted_by
       FROM event e LEFT JOIN organizer o ON o.id = e.organizer_id
       WHERE e.venue_id = ? AND e.cancelled = 0 AND e.id IS NOT ? AND (? IS NULL OR e.flyer_key IS NOT ?)
         AND e.starts_at < ? AND e.starts_at >= ?
       ORDER BY e.starts_at`,
    )
    .bind(slot.venueId, slot.eventId, slot.flyerKey, slot.flyerKey, end, plusHours(slot.startsAt, -24 * LONGEST_DAYS))
    .all<{ title: string; starts_at: string; ends_at: string | null; posted_by: string | null }>();
  return results
    .filter((o) => slot.startsAt < (o.ends_at ?? plusHours(o.starts_at, ASSUMED_HOURS)))
    .map((o) => {
      const when = `${formatDate(o.starts_at.slice(0, 10), slot.startsAt)} ${o.starts_at.slice(11)}`;
      return `Am selben Ort zur selben Zeit steht schon „${o.title}“ (${[o.posted_by, when].filter(Boolean).join(", ")}) – doppelt?`;
    });
}

// "YYYY-MM-DDTHH:MM" wall-clock time shifted by whole hours.
function plusHours(local: string, hours: number): string {
  return new Date(Date.parse(`${local}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16);
}
