import type { ExtractedEvent } from "./extraction/extract";
import { endsAt, findVenue, UNKNOWN_VENUE } from "./publish";
import { formatDate } from "./whatsapp/summary";

// Likely duplicates: another Event at the same Venue whose time overlaps. Warned about on publish and
// on edit, never blocked, whoever posted the other Event. Events from the same Flyer don't count
// (a Workshop before its Party), nor do cancelled ones. The chat asks about Tip Events on their own
// ("Ist das dasselbe?"), since the Organizer's Event replaces a Tip Event it's the same as.

type Slot = {
  venueId: number;
  startsAt: string;
  endsAt: string | null;
  flyerKey: string | null;
  except: number[]; // the Event itself, the one a repost replaces, the Tip Event it replaces
  othersOf?: number; // only other Organizers' Events (the chat question; own ones are asked about as reposts)
  tips?: boolean; // true: only Tip Events, false: none
};

export type Overlap = { id: number; title: string; starts_at: string; ends_at: string | null; posted_by: string | null; venue: string };

const ASSUMED_HOURS = 2; // an Event without an end time
const LONGEST_DAYS = 7; // how far back an overlapping Event can start (a Festival)

// For an Event read from a Flyer, before it's published.
export async function duplicatesOfExtracted(
  db: D1Database,
  e: ExtractedEvent,
  flyerKey: string,
  options: { othersOf?: number; except?: number; tips?: false } = {},
): Promise<string[]> {
  const slot = await slotOf(db, e, flyerKey);
  if (!slot) return [];
  return warnings(await overlapping(db, { ...slot, except: [...slot.except, options.except ?? 0], othersOf: options.othersOf, tips: options.tips }), slot.startsAt);
}

// The Tip Events an Event read from a Flyer is likely the same as.
export async function tipsLikeExtracted(db: D1Database, e: ExtractedEvent, flyerKey: string): Promise<Overlap[]> {
  const slot = await slotOf(db, e, flyerKey);
  return slot ? overlapping(db, { ...slot, tips: true }) : [];
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
  return warnings(await overlapping(db, { venueId: e.venue_id, startsAt: e.starts_at, endsAt: e.ends_at, flyerKey: e.flyer_key, except: [eventId] }), e.starts_at);
}

async function slotOf(db: D1Database, e: ExtractedEvent, flyerKey: string): Promise<Slot | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start_date) || !/^\d{2}:\d{2}$/.test(e.start_time)) return null;
  const venueId = await findVenue(db, e);
  if (!venueId || !(e.venue_name || e.venue_address || e.city)) return null;
  return { venueId, startsAt: `${e.start_date}T${e.start_time}`, endsAt: endsAt(e), flyerKey, except: e.update_of ? [e.update_of] : [] };
}

async function overlapping(db: D1Database, slot: Slot): Promise<Overlap[]> {
  const end = slot.endsAt ?? plusHours(slot.startsAt, ASSUMED_HOURS);
  const tips = slot.tips === undefined ? null : slot.tips ? 1 : 0;
  const { results } = await db
    .prepare(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, COALESCE(o.display_name, e.shown_as) AS posted_by, v.name AS venue
       FROM event e JOIN venue v ON v.id = e.venue_id LEFT JOIN organizer o ON o.id = e.organizer_id
       WHERE e.venue_id = ? AND e.cancelled = 0 AND e.id NOT IN (SELECT value FROM json_each(?)) AND (? IS NULL OR e.flyer_key IS NOT ?)
         AND (? IS NULL OR e.organizer_id IS NOT ?) AND (? IS NULL OR e.is_tip = ?)
         AND e.starts_at < ? AND e.starts_at >= ?
       ORDER BY e.starts_at`,
    )
    .bind(slot.venueId, JSON.stringify(slot.except), slot.flyerKey, slot.flyerKey, slot.othersOf ?? null, slot.othersOf ?? null, tips, tips,
      end, plusHours(slot.startsAt, -24 * LONGEST_DAYS))
    .all<Overlap>();
  return results.filter((o) => slot.startsAt < (o.ends_at ?? plusHours(o.starts_at, ASSUMED_HOURS)));
}

// `startsAt`: the Event they overlap, for the dates' wording.
function warnings(overlaps: Overlap[], startsAt: string): string[] {
  return overlaps.map((o) => {
    const when = `${formatDate(o.starts_at.slice(0, 10), startsAt)} ${o.starts_at.slice(11)}`;
    return `Am selben Ort zur selben Zeit steht schon „${o.title}“ (${[o.posted_by, when].filter(Boolean).join(", ")}) – doppelt?`;
  });
}

// "YYYY-MM-DDTHH:MM" wall-clock time shifted by whole hours.
function plusHours(local: string, hours: number): string {
  return new Date(Date.parse(`${local}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16);
}
