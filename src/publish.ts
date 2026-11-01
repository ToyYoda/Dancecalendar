import type { ExtractedEvent } from "./extraction/extract";
import { applyTemplate, createSeries, extendSeries, heldRule, ruleWords, seriesLeads, signOfLife, templateOf, type Rule } from "./series";
import { berlinDate } from "./whatsapp/bot";
import { formatDate } from "./whatsapp/summary";

// Turns a held submission's Events into calendar Events. Returns what was published, with edit links:
// one per single Event, and one per Series (its occurrences are reachable from the Series page).

type Published = { title: string; startsAt: string; editToken: string; updated: boolean; seriesId: number | null };

// A line of the "✅ Ist online!" reply and of the confirm page's Done page.
export type Entry = { title: string; when: string; note: string; label: string; link: string };

// A Tip has no Organizer.
export type Held = { id: string; organizer_id: number | null; flyer_key: string; received_on: string };

// Publishes a held submission once, from the chat or the confirm page: whoever claims it first wins,
// a late second attempt gets null. `text` is the "✅ Ist online!" reply with the edit links. A Tip's
// Events are shown under `shownAs`, marked as from the community.
export async function publishSubmission(
  env: Env,
  submission: Held,
  ready: ExtractedEvent[],
  skipped: ExtractedEvent[],
  shownAs: string | null = null,
): Promise<{ entries: Entry[]; text: string } | null> {
  const { meta } = await env.DB.prepare("UPDATE submission SET status = 'published' WHERE id = ? AND status = 'pending'")
    .bind(submission.id)
    .run();
  if (meta.changes !== 1) return null;
  const published = await publishEvents(env.DB, { ...submission, shownAs }, ready, berlinDate(new Date()));
  const entries = await entriesOf(env, published, submission.received_on);

  const lines = entries.map((p) => `*${p.title}* – ${p.when}${p.note}\n${p.label}: ${p.link}`);
  if (skipped.length) lines.push(`Nicht eingetragen: ${skipped.map((e) => e.title).join(", ")}`);
  return { entries, text: `✅ Ist online!\n\n${lines.join("\n\n")}\n\nDie Links sind privat – nicht weiterleiten.` };
}

async function entriesOf(env: Env, published: Published[], receivedOn: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  const seen = new Set<number>();
  for (const p of published) {
    if (!p.seriesId) {
      const note = p.updated ? " (aktualisiert, der alte Link gilt weiter)" : "";
      entries.push({ title: p.title, when: formatDate(p.startsAt.slice(0, 10), receivedOn), note, label: "Bearbeiten", link: `${env.PUBLIC_URL}/e/${p.editToken}` });
      continue;
    }
    if (seen.has(p.seriesId)) continue;
    seen.add(p.seriesId);
    const s = (await env.DB.prepare(
      "SELECT edit_token, rule, (SELECT COUNT(*) FROM event WHERE series_id = series.id) AS n FROM series WHERE id = ?",
    )
      .bind(p.seriesId)
      .first<{ edit_token: string; rule: string; n: number }>())!;
    const rule = JSON.parse(s.rule) as Rule;
    const from = formatDate(p.startsAt.slice(0, 10), receivedOn);
    const when = rule.freq === "custom" ? `${from}, 🔁 ${ruleWords(rule)} – prüft der Admin` : `🔁 ${ruleWords(rule)}, ab ${from}`;
    const note = p.updated ? " (verlängert)" : s.n > 1 ? ` (${s.n} Termine eingetragen)` : "";
    entries.push({ title: p.title, when, note, label: "Serie bearbeiten", link: `${env.PUBLIC_URL}/s/${s.edit_token}` });
  }
  return entries;
}

async function publishEvents(
  db: D1Database,
  submission: { organizer_id: number | null; flyer_key: string; shownAs: string | null },
  events: ExtractedEvent[],
  today: string,
): Promise<Published[]> {
  const published: Published[] = [];
  const leads = seriesLeads(events);
  const created = new Map<number, number>(); // the lead Event's index → its new Series
  for (const [i, e] of events.entries()) {
    const c = await columns(db, e);
    // A repost the Organizer called an update replaces their existing Event, which keeps its edit link.
    const updated =
      e.update_of &&
      (await db
        .prepare(
          `UPDATE event SET title = ?, type = ?, styles = ?, starts_at = ?, ends_at = ?, intro_class_at = ?, level = ?,
                            description = ?, price = ?, venue_id = ?, flyer_key = ?
           WHERE id = ? AND organizer_id = ? RETURNING edit_token, series_id`,
        )
        .bind(c.title, c.type, c.styles, c.starts_at, c.ends_at, c.intro_class_at, c.level, e.description || null, c.price, c.venue_id,
          submission.flyer_key, e.update_of, submission.organizer_id)
        .first<{ edit_token: string; series_id: number | null }>());
    if (updated) {
      if (updated.series_id) {
        // The Series' Flyer again: its fields count for the dates ahead. A one-off Flyer changes only its date.
        if (e.series.is_series) await applyTemplate(db, updated.series_id, templateOf(c, e.description || null, submission.flyer_key), c.starts_at.slice(0, 10));
        else await db.prepare("UPDATE event SET detached = 1 WHERE id = ?").bind(e.update_of).run();
        await signOfLife(db, updated.series_id, today);
      }
      published.push({ title: e.title, startsAt: c.starts_at, editToken: updated.edit_token, updated: true, seriesId: updated.series_id });
      continue;
    }

    const rule = heldRule(events[leads[i]]);
    let seriesId: number | null = null;
    if (rule) {
      seriesId = created.get(leads[i]) ?? null;
      if (!seriesId) {
        const lead = events[leads[i]];
        const dates = events.filter((_, k) => leads[k] === leads[i]).map((o) => o.start_date).sort();
        const series = await createSeries(db, {
          organizerId: submission.organizer_id,
          shownAs: submission.shownAs,
          rule,
          template: templateOf(await columns(db, lead), lead.description || null, submission.flyer_key),
          registrationRequired: lead.type === "workshop" && lead.registration_required,
          generatedUntil: dates.at(-1)!,
          today,
        });
        seriesId = series.id;
        created.set(leads[i], seriesId);
      }
    }
    const editToken = randomToken();
    await db
      .prepare(
        `INSERT INTO event (title, type, styles, starts_at, ends_at, intro_class_at, level, description, price,
                            venue_id, organizer_id, flyer_key, series_id, edit_token, is_tip, shown_as)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        seriesId,
        editToken,
        submission.organizer_id === null ? 1 : 0,
        submission.organizer_id === null ? submission.shownAs : null,
      )
      .run();
    // "Ja, dasselbe": the Organizer's Event takes the Tip Event's place.
    if (e.replaces_tip) await db.prepare("DELETE FROM event WHERE id = ? AND is_tip = 1").bind(e.replaces_tip).run();
    published.push({ title: e.title, startsAt: c.starts_at, editToken, updated: false, seriesId });
  }
  for (const id of created.values()) await extendSeries(db, today, id);
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
export function endsAt(e: Pick<ExtractedEvent, "start_date" | "start_time" | "end_date" | "end_time">): string | null {
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
