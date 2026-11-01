import { duplicatesOfExtracted } from "../duplicates";
import type { ExtractedEvent, Extraction } from "../extraction/extract";
import { geocode, type Place } from "../geocode";
import { findVenue, normalize, venueQuery } from "../publish";
import { ruleButtons, ruleFromFlyer, ruleFromValue, seriesLeads, type Rule } from "../series";
import { sendButtons, sendText, type Button } from "./graph";
import { formatDate, publishable, summary } from "./summary";

// The blocking questions the bot asks about a held Flyer before its summary, one message each, in this
// order: a reposted Event (update or new?), a Series' next date when the Flyer prints none, an ambiguous
// Series rule, a missing start time, a new Venue (is this the place the geocoder found?), a likely
// duplicate of another Organizer's Event. The next question is worked out
// afresh from the held Events each time, so a stale or repeated tap can't answer the wrong one.
// The answers live on the held Events (`HeldAnswers`); typed answers wait in `submission.awaiting`.
// Decisions: .scratch/dance-calendar-mvp/issues/08-organizer-confirmation-flow.md (variant C).

type Kind = "repost" | "date" | "rule" | "time" | "venue" | "duplicate";
type Awaiting = { kind: "date" | "rule" | "time" | "address"; i: number };
type Question = { kind: Kind; i: number; text: string; buttons: Button[]; awaiting?: Awaiting };

type Held = {
  id: string;
  organizer_id: number;
  flyer_key: string;
  received_on: string;
  extraction: string;
  awaiting: string | null;
  first_name: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Asks the next open question about a held Flyer, or sends the summary with its buttons once none is left.
export async function continueFlyer(env: Env, to: string, id: string) {
  const s = await load(env.DB, id);
  if (!s) return;
  const extraction = JSON.parse(s.extraction) as Extraction;
  const q = await nextQuestion(env, s, extraction.events);
  await save(env.DB, id, extraction, q?.awaiting ?? null); // keeps the geocoder's answers
  if (!q) return sendSummary(env, to, s, extraction.events);
  return q.buttons.length ? sendButtons(env, to, q.text, q.buttons) : sendText(env, to, q.text);
}

// A tapped question button: q|<submission>|<kind>|<event index>|<value>.
export async function answerButton(env: Env, from: string, organizerId: number, buttonId: string) {
  const [, id, kind, index, value] = buttonId.split("|");
  const s = await load(env.DB, id);
  if (!s || s.organizer_id !== organizerId) return sendText(env, from, "Dieser Flyer ist schon erledigt.");
  const extraction = JSON.parse(s.extraction) as Extraction;
  const events = extraction.events;
  const q = await nextQuestion(env, s, events);
  if (!q || q.kind !== kind || q.i !== Number(index)) return sendText(env, from, "Diese Frage ist schon beantwortet.");

  const e = events[q.i];
  let awaiting: Awaiting | null = null;
  let prompt = "";
  if (kind === "repost") {
    if (value !== "new") e.update_of = Number(value);
    answer(e, "repost");
  } else if (kind === "date") {
    e.dropped = true; // the only button: "Event weglassen"
  } else if (kind === "rule") {
    if (value === "other") [awaiting, prompt] = [{ kind: "rule", i: q.i }, "Schreib mir, wann es stattfindet, z. B. „jeden 1. und 3. Freitag“. Der Admin schaut es sich an."];
    else setRule(events, q.i, ruleFromValue(value, e.start_date, null));
  } else if (kind === "time") {
    if (value === "drop") e.dropped = true;
    else if (value === "other") [awaiting, prompt] = [{ kind: "time", i: q.i }, "Schick mir die Uhrzeit, z. B. 21:00."];
    else [e.start_time, e.answered] = [value, { ...e.answered, time: true }];
  } else if (kind === "venue") {
    if (value === "yes") confirmVenue(events, q.i, e.venue_guess!.place!);
    else if (value === "none") sameVenue(events, q.i).forEach((v) => answer(v, "venue"));
    else [awaiting, prompt] = [{ kind: "address", i: q.i }, "Schick mir die Adresse (Straße, Ort)."];
  } else if (kind === "duplicate") {
    if (value === "drop") e.dropped = true;
    answer(e, "duplicate");
  }
  await save(env.DB, id, extraction, awaiting);
  return awaiting ? sendText(env, from, prompt) : continueFlyer(env, from, id);
}

// A typed answer to "Andere Uhrzeit" or a Venue's address. Returns false when no question waits for one.
export async function answerTyped(env: Env, from: string, organizerId: number, text: string): Promise<boolean> {
  const s = await env.DB.prepare(
    `SELECT id FROM submission WHERE organizer_id = ? AND status = 'pending' AND awaiting IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(organizerId)
    .first<{ id: string }>();
  const held = s && (await load(env.DB, s.id));
  if (!held) return false;
  const awaiting = JSON.parse(held.awaiting!) as Awaiting;
  const extraction = JSON.parse(held.extraction) as Extraction;
  if (awaiting.kind === "date") {
    const date = parseDate(text, held.received_on);
    if (!date) {
      await sendText(env, from, "Das habe ich nicht verstanden. Schick mir das Datum so: 14.10.");
      return true;
    }
    const e = extraction.events[awaiting.i];
    [e.start_date, e.answered] = [date, { ...e.answered, date: true }];
  } else if (awaiting.kind === "rule") {
    const e = extraction.events[awaiting.i];
    setRule(extraction.events, awaiting.i, { freq: "custom", text: text.trim().slice(0, 200), anchor: e.start_date });
  } else if (awaiting.kind === "time") {
    const time = parseTime(text);
    if (!time) {
      await sendText(env, from, "Das habe ich nicht verstanden. Schick mir die Uhrzeit so: 21:00");
      return true;
    }
    const e = extraction.events[awaiting.i];
    [e.start_time, e.answered] = [time, { ...e.answered, time: true }];
  } else {
    // The Venue question comes again with what the geocoder finds for this address.
    for (const e of sameVenue(extraction.events, awaiting.i)) [e.venue_address, e.city] = [text.trim().slice(0, 200), ""];
  }
  await save(env.DB, held.id, extraction, null);
  await continueFlyer(env, from, held.id);
  return true;
}

async function nextQuestion(env: Env, s: Held, events: ExtractedEvent[]): Promise<Question | null> {
  const open = (kind: Kind) => events.map((e, i) => [e, i] as const).filter(([e]) => !e.dropped && !e.answered?.[kind]);
  const button = (kind: Kind, i: number, value: string, title: string) => ({ id: `q|${s.id}|${kind}|${i}|${value}`, title });
  const when = (e: ExtractedEvent) => formatDate(e.start_date, s.received_on);

  for (const [e, i] of open("repost")) {
    if (!DATE.test(e.start_date)) continue;
    const taken = events.map((o) => o.update_of).filter((id) => id !== undefined);
    const own = await ownEventLike(env.DB, s.organizer_id, e, taken);
    if (!own) continue;
    const diff = [
      e.start_time && e.start_time !== own.starts_at.slice(11) ? `Beginn ${e.start_time} statt ${own.starts_at.slice(11)}` : "",
      e.venue_name && normalize(e.venue_name) !== normalize(own.venue) ? `Ort „${e.venue_name}“ statt „${own.venue}“` : "",
    ].filter(Boolean);
    if (own.series_id) e.update_series = own.series_id;
    // The same Series Flyer again extends the Series without asking.
    if (own.series_id && e.series.is_series && !diff.length) {
      e.update_of = own.id;
      answer(e, "repost");
      continue;
    }
    const text =
      `Den kenne ich schon: „${own.title}“ am ${when(e)} hast du schon eingetragen.` +
      (diff.length ? `\nNeu auf diesem Flyer: ${diff.join(", ")}.` : "") +
      "\nIst das ein Update?";
    return { kind: "repost", i, text, buttons: [button("repost", i, String(own.id), "Ja, Update"), button("repost", i, "new", "Nein, neues Event")] };
  }

  const leads = seriesLeads(events);
  for (const [e, i] of open("date")) {
    if (!e.series.is_series || DATE.test(e.start_date)) continue;
    return {
      kind: "date",
      i,
      text: `„${e.title || "(ohne Titel)"}“ ist eine Serie („${e.series.rule_text}“). Wann ist der nächste Termin? Schick mir das Datum, z. B. 14.10.`,
      buttons: [button("date", i, "drop", "Event weglassen")],
      awaiting: { kind: "date", i },
    };
  }

  for (const [e, i] of open("rule")) {
    if (!e.series.is_series || leads[i] !== i || !DATE.test(e.start_date) || (e.update_of && e.update_series) || ruleFromFlyer(e)) continue;
    return {
      kind: "rule",
      i,
      text: `„${e.title || "(ohne Titel)"}“ ab ${when(e)}: Auf dem Flyer steht „${e.series.rule_text}“. Wie ist das gemeint?`,
      buttons: [...ruleButtons(e.start_date, e.series.rule_text).map((b) => button("rule", i, b.value, b.title)), button("rule", i, "other", "Anders …")],
    };
  }

  for (const [e, i] of open("time")) {
    if (!DATE.test(e.start_date) || e.start_date < s.received_on || e.start_time) continue;
    const suggestion = events.find((o) => o !== e && !o.dropped && o.start_time)?.start_time;
    return {
      kind: "time",
      i,
      text: `Für „${e.title || "(ohne Titel)"}“ am ${when(e)} finde ich keine Anfangszeit. Wann geht's los?\n(Ohne Uhrzeit kann ich es nicht eintragen.)`,
      buttons: [
        ...(suggestion ? [button("time", i, suggestion, suggestion)] : []),
        button("time", i, "other", "Andere Uhrzeit"),
        button("time", i, "drop", "Event weglassen"),
      ],
    };
  }

  for (const [e, i] of open("venue")) {
    if (!venueQuery(e) || (await findVenue(env.DB, e))) continue;
    const place = await guessVenue(env, e);
    const name = e.venue_name || e.venue_address;
    if (place) {
      return {
        kind: "venue",
        i,
        text: `„${name}“ kenne ich noch nicht. Ist es das hier?\n📍 ${place.label}`,
        buttons: [button("venue", i, "yes", "Ja, genau"), button("venue", i, "no", "Nein, andere Adresse")],
      };
    }
    return {
      kind: "venue",
      i,
      text: `„${name}“ kenne ich noch nicht und finde es auch nicht auf der Karte. Schick mir die Adresse (Straße, Ort) – oder trag es ohne Adresse ein.`,
      buttons: [button("venue", i, "none", "Ohne Adresse")],
      awaiting: { kind: "address", i },
    };
  }

  for (const [e, i] of open("duplicate")) {
    if (!publishable(e, s.received_on)) continue;
    const warnings = await duplicatesOfExtracted(env.DB, e, s.flyer_key, s.organizer_id);
    if (!warnings.length) continue;
    return {
      kind: "duplicate",
      i,
      text: `„${e.title}“: ${warnings.join("\n")}`,
      buttons: [button("duplicate", i, "keep", "Beide behalten"), button("duplicate", i, "drop", "Meins weglassen")],
    };
  }
  return null;
}

// What the geocoder finds for an Event's venue fields, asked once per wording and kept on the Event.
export async function guessVenue(env: Env, e: ExtractedEvent): Promise<Place | null> {
  const query = venueQuery(e);
  if (e.venue_guess?.query !== query) {
    e.venue_guess = { query, place: await geocode(env, { name: e.venue_name, address: e.venue_address, city: e.city }) };
  }
  return e.venue_guess.place;
}

// The Organizer's own Event on the same day with the same title or Venue: a reposted Flyer.
async function ownEventLike(db: D1Database, organizerId: number, e: ExtractedEvent, taken: number[]) {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.title, e.starts_at, e.series_id, v.name AS venue FROM event e JOIN venue v ON v.id = e.venue_id
       WHERE e.organizer_id = ? AND e.cancelled = 0 AND substr(e.starts_at, 1, 10) = ? ORDER BY e.starts_at`,
    )
    .bind(organizerId, e.start_date)
    .all<{ id: number; title: string; starts_at: string; series_id: number | null; venue: string }>();
  const place = normalize(e.venue_name || e.venue_address);
  return (
    results.find((o) => !taken.includes(o.id) && (normalize(o.title) === normalize(e.title) || (place && normalize(o.venue) === place))) ?? null
  );
}

// Several Events on one Flyer usually share their Venue, so its answer counts for all of them.
function sameVenue(events: ExtractedEvent[], i: number): ExtractedEvent[] {
  const key = normalize(events[i].venue_name || events[i].venue_address);
  return events.filter((e) => normalize(e.venue_name || e.venue_address) === key);
}

function confirmVenue(events: ExtractedEvent[], i: number, place: Place) {
  for (const e of sameVenue(events, i)) {
    [e.venue_address, e.city] = [place.address, ""];
    e.venue_guess = { query: venueQuery(e), place };
    answer(e, "venue");
  }
}

const answer = (e: ExtractedEvent, kind: Kind) => (e.answered = { ...e.answered, [kind]: true });

// A Series rule counts for every Event of that Series on the Flyer.
function setRule(events: ExtractedEvent[], lead: number, rule: Rule | null) {
  const leads = seriesLeads(events);
  events.forEach((e, k) => {
    if (leads[k] !== lead) return;
    e.series_rule = rule;
    answer(e, "rule");
  });
}

// "14.10.", "14.10", "14.10.2026", "14.10.26"; without a year, the next such date from the day the Flyer arrived.
function parseDate(text: string, receivedOn: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/.exec(text.trim());
  if (!m) return null;
  const [d, mo] = [m[1].padStart(2, "0"), m[2].padStart(2, "0")];
  const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : receivedOn.slice(0, 4);
  let date = `${year}-${mo}-${d}`;
  if (!m[3] && date < receivedOn) date = `${Number(year) + 1}-${mo}-${d}`;
  const check = new Date(`${date}T00:00:00Z`);
  if (isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date || date < receivedOn) return null;
  return date;
}

// "21:00", "21.30", "21 Uhr", "9:15".
function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?$/i.exec(text.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
}

async function sendSummary(env: Env, to: string, s: Held, events: ExtractedEvent[]) {
  const shown = events.filter((e) => !e.dropped);
  if (!shown.length) {
    await env.DB.prepare("UPDATE submission SET status = 'discarded' WHERE id = ?").bind(s.id).run();
    await env.FLYERS.delete(s.flyer_key);
    return sendText(env, to, "Alles weggelassen – ich trage nichts ein.");
  }
  const dropped = events.filter((e) => e.dropped).map((e) => e.title);
  const text = summary(shown, s.received_on, s.first_name) + (dropped.length ? `\n\nWeggelassen: ${dropped.join(", ")}` : "");
  // Without a publishable Event there's nothing to publish as is, but a missing date can be fixed on the confirm page.
  const buttons = [
    ...(shown.some((e) => publishable(e, s.received_on)) ? [{ id: `publish:${s.id}`, title: "Veröffentlichen" }] : []),
    { id: `edit:${s.id}`, title: "Ändern ✏️" },
    { id: `discard:${s.id}`, title: "Verwerfen" },
  ];
  return sendButtons(env, to, text, buttons);
}

async function load(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT s.id, s.organizer_id, s.flyer_key, s.received_on, s.extraction, s.awaiting, o.first_name
       FROM submission s JOIN organizer o ON o.id = s.organizer_id WHERE s.id = ? AND s.status = 'pending'`,
    )
    .bind(id)
    .first<Held>();
}

async function save(db: D1Database, id: string, extraction: Extraction, awaiting: Awaiting | null) {
  await db.prepare("UPDATE submission SET extraction = ?, awaiting = ? WHERE id = ?")
    .bind(JSON.stringify(extraction), awaiting && JSON.stringify(awaiting), id)
    .run();
}
