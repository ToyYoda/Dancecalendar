import type { ExtractedEvent } from "./extraction/extract";
import { endsAt, normalize, randomToken } from "./publish";

// A Series is a rule that generates real Events (its occurrences) 12 weeks ahead, but only up to
// 12 weeks after its last sign of life: a repost or an edit (ADR 0001). A Course is a Series of
// Workshops with registration required. Occurrences sit on their rule date unless they were changed
// through their own edit link (`detached`); Series edits leave those alone.
// Decisions: .scratch/dance-calendar-mvp/issues/06-event-data-model.md

// n of "nth_weekday": 1–4, or -1 for the last one in the month. "custom" is a rule the Organizer
// typed in the chat; it generates nothing until the Admin has checked it.
export type Rule = { anchor: string } & (
  | { freq: "weekly" }
  | { freq: "every_n_weeks"; n: number }
  | { freq: "nth_weekday"; n: number }
  | { freq: "custom"; text: string }
);

// The fields every occurrence shares; the date comes from the rule.
export type Template = {
  title: string;
  type: ExtractedEvent["type"];
  styles: string;
  start_time: string;
  end_time: string;
  intro_class_time: string;
  level: string | null;
  description: string | null;
  price: string | null;
  venue_id: number;
  flyer_key: string | null;
};

export const HORIZON_DAYS = 84; // 12 weeks, both ahead and after the last sign of life
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// ---- Rules and their dates ----

// The rule dates after `after` up to and including `until`, never before the anchor.
export function ruleDates(rule: Rule, after: string, until: string): string[] {
  const out: string[] = [];
  if (rule.freq === "weekly" || rule.freq === "every_n_weeks") {
    const step = 7 * (rule.freq === "weekly" ? 1 : rule.n);
    for (let d = rule.anchor; d <= until; d = addDays(d, step)) if (d > after) out.push(d);
  } else if (rule.freq === "nth_weekday") {
    const weekday = weekdayOf(rule.anchor);
    let [y, m] = [Number(rule.anchor.slice(0, 4)), Number(rule.anchor.slice(5, 7)) - 1];
    for (;;) {
      const d = nthWeekday(y, m, weekday, rule.n);
      if (d && d > until) break;
      if (d && d >= rule.anchor && d > after) out.push(d);
      if (!d && `${y}-${String(m + 1).padStart(2, "0")}` > until.slice(0, 7)) break;
      [y, m] = m === 11 ? [y + 1, 0] : [y, m + 1];
    }
  }
  return out;
}

// "Jeden Freitag", "Alle 2 Wochen mittwochs", "Jeden 2. Mittwoch im Monat", "Jeden letzten Freitag im Monat".
export function ruleWords(rule: Rule, lang: "de" | "en" = "de"): string {
  if (lang === "en") return ruleWordsEn(rule);
  const day = WEEKDAY[weekdayOf(rule.anchor)];
  switch (rule.freq) {
    case "weekly":
      return `Jeden ${day}`;
    case "every_n_weeks":
      return `Alle ${rule.n} Wochen ${day.toLowerCase()}s`;
    case "nth_weekday":
      return rule.n === -1 ? `Jeden letzten ${day} im Monat` : `Jeden ${rule.n}. ${day} im Monat`;
    case "custom":
      return `„${rule.text}“`;
  }
}

const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL_EN = ["", "1st", "2nd", "3rd", "4th"];

function ruleWordsEn(rule: Rule): string {
  const day = WEEKDAY_EN[weekdayOf(rule.anchor)];
  switch (rule.freq) {
    case "weekly":
      return `Every ${day}`;
    case "every_n_weeks":
      return `Every ${rule.n} weeks on ${day}s`;
    case "nth_weekday":
      return `Every ${rule.n === -1 ? "last" : ORDINAL_EN[rule.n]} ${day} of the month`;
    case "custom":
      return `“${rule.text}”`;
  }
}

// The first `count` dates of a new Series: the Flyer's own dates, then the rule's.
export function firstDates(rule: Rule, own: string[], count = 3): string[] {
  const listed = [...own].sort();
  const last = listed.at(-1) ?? addDays(rule.anchor, -1);
  return [...listed, ...ruleDates(rule, last, addDays(last, 400))].slice(0, count);
}

// The rule the Flyer states, anchored on the Event's date; null when it's ambiguous or there's no date.
export function ruleFromFlyer(e: ExtractedEvent): Rule | null {
  if (!e.series.is_series || !DATE.test(e.start_date)) return null;
  const anchor = e.start_date;
  const text = e.series.rule_text.toLowerCase();
  switch (e.series.frequency) {
    case "weekly":
      return { freq: "weekly", anchor };
    case "every_n_weeks": {
      const n = weeksIn(text);
      return n ? { freq: "every_n_weeks", n, anchor } : null;
    }
    case "nth_weekday_of_month":
      // "jeden 1. und 3. Freitag" is two rules; it's asked about.
      if (/\d\.?\s*(und|&|\+|,|and|y)\s*\d/.test(text)) return null;
      return { freq: "nth_weekday", n: /letzt|last|últim|ultim/.test(text) ? -1 : position(anchor), anchor };
    default:
      return null;
  }
}

function weeksIn(text: string): number | null {
  const m = /(\d)\s*(wochen|weeks|semanas)/.exec(text);
  if (m && Number(m[1]) >= 2) return Number(m[1]);
  return /zweite|zwei wochen|other|14[- ]?(t[äa]gig|tage)|zweiw[öo]ch|biweekly|bi-weekly|cada dos/.test(text) ? 2 : null;
}

// ---- Choosing a rule: chat buttons and the cards' "Wiederholung" select share these values ----

// "weekly", "every:2", "nth:2", "nth:-1", "custom" (keeps the typed rule), "none" (just this date).
export function ruleValue(rule: Rule | null): string {
  if (!rule) return "none";
  if (rule.freq === "every_n_weeks") return `every:${rule.n}`;
  if (rule.freq === "nth_weekday") return `nth:${rule.n}`;
  return rule.freq;
}

export function ruleFromValue(value: string, anchor: string, current: Rule | null): Rule | null {
  const [kind, n] = value.split(":");
  if (kind === "weekly") return { freq: "weekly", anchor };
  if (kind === "every") return { freq: "every_n_weeks", n: Number(n) || 2, anchor };
  if (kind === "nth") return { freq: "nth_weekday", n: Number(n) || position(anchor), anchor };
  if (kind === "custom" && current?.freq === "custom") return { ...current, anchor };
  return null;
}

// The rules a date can follow, for the select on the confirm and Series pages.
export function ruleOptions(anchor: string, current: Rule | null): { value: string; label: string }[] {
  if (!DATE.test(anchor)) {
    return [
      { value: "weekly", label: "Jede Woche" },
      { value: "every:2", label: "Alle 2 Wochen" },
      { value: "nth:0", label: "Einmal im Monat (wie das Datum)" },
    ];
  }
  const rules: Rule[] = [
    { freq: "weekly", anchor },
    { freq: "every_n_weeks", n: 2, anchor },
    ...(current?.freq === "every_n_weeks" && current.n !== 2 ? [{ ...current, anchor }] : []),
    ...(position(anchor) <= 4 ? [{ freq: "nth_weekday" as const, n: position(anchor), anchor }] : []),
    ...(isLastOfMonth(anchor) ? [{ freq: "nth_weekday" as const, n: -1, anchor }] : []),
    ...(current?.freq === "custom" ? [{ ...current, anchor }] : []),
  ];
  return rules.map((r) => ({ value: ruleValue(r), label: r.freq === "custom" ? `${ruleWords(r)} (prüft der Admin)` : ruleWords(r) }));
}

// The chat's rule question offers "every N weeks" and "nth weekday of the month" for the Event's date.
export function ruleButtons(anchor: string, ruleText: string): { value: string; title: string }[] {
  const n = weeksIn(ruleText.toLowerCase()) ?? 2;
  const day = WEEKDAY_SHORT[weekdayOf(anchor)];
  const nth = position(anchor) <= 4 && !/letzt|last/.test(ruleText.toLowerCase())
    ? { value: `nth:${position(anchor)}`, title: `${position(anchor)}. ${day} im Monat` }
    : { value: "nth:-1", title: `Letzter ${day} im Monat` };
  return [{ value: `every:${n}`, title: `Alle ${n} Wochen` }, nth];
}

// ---- Events of one Series on a Flyer ----

// A Flyer that lists several dates of a Series returns one Event per date: they form one Series, led
// by the first. Returns, per Event index, the index of its lead (itself for a lone Event).
export function seriesLeads(events: ExtractedEvent[]): number[] {
  return events.map((e, i) => {
    if (!e.series.is_series || e.dropped) return i;
    const lead = events.findIndex((o) => o.series.is_series && !o.dropped && normalize(o.title) === normalize(e.title));
    return lead === -1 ? i : lead;
  });
}

// The rule a held Event will be published with: what the Organizer chose, or what the Flyer states.
export function heldRule(e: ExtractedEvent): Rule | null {
  if (e.series_rule === null || !e.series.is_series) return null;
  if (e.series_rule) return DATE.test(e.start_date) ? { ...e.series_rule, anchor: e.start_date } : null;
  return ruleFromFlyer(e);
}

// ---- Stored Series ----

type SeriesRow = {
  id: number;
  organizer_id: number | null;
  shown_as: string | null; // a Tip Series: the name its Events are shown under
  rule: string;
  template: string;
  generated_until: string;
  last_sign_of_life: string;
  edit_token: string;
};

export async function createSeries(
  db: D1Database,
  s: {
    organizerId: number | null; // a Tip Series has none, and its Events are shown under `shownAs`
    shownAs?: string | null;
    rule: Rule;
    template: Template;
    registrationRequired: boolean;
    generatedUntil: string;
    today: string;
  },
): Promise<{ id: number; token: string }> {
  const token = randomToken();
  const row = await db
    .prepare(
      `INSERT INTO series (organizer_id, shown_as, rule, template, registration_required, last_sign_of_life, generated_until, edit_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(s.organizerId, s.organizerId === null ? (s.shownAs ?? null) : null, JSON.stringify(s.rule), JSON.stringify(s.template),
      s.registrationRequired ? 1 : 0, s.today, s.generatedUntil, token)
    .first<{ id: number }>();
  return { id: row!.id, token };
}

// Generates the missing occurrences of every running Series (the daily cron), or of one.
export async function extendSeries(db: D1Database, today: string, seriesId?: number) {
  const { results } = await db
    .prepare(
      `SELECT id, organizer_id, shown_as, rule, template, generated_until, last_sign_of_life, edit_token FROM series
       WHERE ended_at IS NULL AND (? IS NULL OR id = ?)`,
    )
    .bind(seriesId ?? null, seriesId ?? null)
    .all<SeriesRow>();
  for (const s of results) {
    const until = minDate(addDays(today, HORIZON_DAYS), addDays(s.last_sign_of_life, HORIZON_DAYS));
    if (until <= s.generated_until) continue;
    // Dates the cron missed are in the past by now and stay out.
    const after = s.generated_until > today ? s.generated_until : addDays(today, -1);
    const template = JSON.parse(s.template) as Template;
    const inserts = ruleDates(JSON.parse(s.rule), after, until).map((date) => insertOccurrence(db, s, template, date));
    await db.batch([...inserts, db.prepare("UPDATE series SET generated_until = ? WHERE id = ?").bind(until, s.id)]);
  }
}

// A Series without an Organizer is a Tip Series: its Events are Tip Events.
function insertOccurrence(db: D1Database, s: Pick<SeriesRow, "id" | "organizer_id" | "shown_as">, t: Template, date: string) {
  const c = occurrence(t, date);
  const tip = s.organizer_id === null;
  return db
    .prepare(
      `INSERT INTO event (title, type, styles, starts_at, ends_at, intro_class_at, level, description, price,
                          venue_id, organizer_id, flyer_key, series_id, edit_token, is_tip, shown_as)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(c.title, c.type, c.styles, c.starts_at, c.ends_at, c.intro_class_at, t.level, t.description, t.price, t.venue_id, s.organizer_id,
      t.flyer_key, s.id, randomToken(), tip ? 1 : 0, tip ? s.shown_as : null);
}

// An occurrence's own columns on a date.
function occurrence(t: Template, date: string) {
  return {
    title: t.title,
    type: t.type,
    styles: t.styles,
    starts_at: `${date}T${t.start_time}`,
    ends_at: endsAt({ start_date: date, start_time: t.start_time, end_date: "", end_time: t.end_time }),
    intro_class_at: t.intro_class_time ? `${date}T${t.intro_class_time}` : null,
  };
}

// The Template of an Event's columns (publish.ts `columns`).
export function templateOf(
  c: { title: string; type: ExtractedEvent["type"]; styles: string; starts_at: string; ends_at: string | null; intro_class_at: string | null; level: string | null; price: string | null; venue_id: number },
  description: string | null,
  flyerKey: string | null,
): Template {
  return {
    title: c.title,
    type: c.type,
    styles: c.styles,
    start_time: c.starts_at.slice(11),
    end_time: c.ends_at?.slice(11) ?? "",
    intro_class_time: c.intro_class_at?.slice(11) ?? "",
    level: c.level,
    description,
    price: c.price,
    venue_id: c.venue_id,
    flyer_key: flyerKey,
  };
}

// Stores a Series' new Template and gives it to its occurrences from `from` on, except detached ones.
export async function applyTemplate(db: D1Database, seriesId: number, t: Template, from: string) {
  const { results } = await db
    .prepare("SELECT id, substr(starts_at, 1, 10) AS date FROM event WHERE series_id = ? AND detached = 0 AND starts_at >= ?")
    .bind(seriesId, from)
    .all<{ id: number; date: string }>();
  await db.batch([
    db.prepare("UPDATE series SET template = ? WHERE id = ?").bind(JSON.stringify(t), seriesId),
    ...results.map((r) => {
      const c = occurrence(t, r.date);
      return db
        .prepare(
          `UPDATE event SET title = ?, type = ?, styles = ?, starts_at = ?, ends_at = ?, intro_class_at = ?, level = ?, description = ?,
                            price = ?, venue_id = ?, flyer_key = ? WHERE id = ?`,
        )
        .bind(c.title, c.type, c.styles, c.starts_at, c.ends_at, c.intro_class_at, t.level, t.description, t.price, t.venue_id, t.flyer_key, r.id);
    }),
  ]);
}

// A new rule or date: the generated occurrences from today on go, and the rule starts again at its anchor.
export async function changeRule(db: D1Database, seriesId: number, rule: Rule, today: string) {
  await db.batch([
    db.prepare("DELETE FROM event WHERE series_id = ? AND detached = 0 AND starts_at >= ?").bind(seriesId, today),
    db.prepare("UPDATE series SET rule = ?, generated_until = ? WHERE id = ?").bind(JSON.stringify(rule), addDays(rule.anchor, -1), seriesId),
  ]);
}

// A repost or an edit: the Series runs another 12 weeks from today.
export async function signOfLife(db: D1Database, seriesId: number, today: string) {
  await db.prepare("UPDATE series SET last_sign_of_life = ? WHERE id = ? AND last_sign_of_life < ?").bind(today, seriesId, today).run();
  await extendSeries(db, today, seriesId);
}

// Ending a Series removes its future occurrences; past ones stay until the normal clean-up.
export async function endSeries(db: D1Database, seriesId: number, today: string) {
  await db.batch([
    db.prepare("UPDATE series SET ended_at = datetime('now') WHERE id = ?").bind(seriesId),
    db.prepare("DELETE FROM event WHERE series_id = ? AND starts_at >= ?").bind(seriesId, today),
  ]);
}

// ---- Dates ----

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const position = (iso: string) => Math.ceil(Number(iso.slice(8, 10)) / 7); // 2 = the 2nd of its weekday in the month
const isLastOfMonth = (iso: string) => addDays(iso, 7).slice(5, 7) !== iso.slice(5, 7);

// The nth weekday of a month (month 0-based), or null when the month has no 5th one.
function nthWeekday(year: number, month: number, weekday: number, n: number): string | null {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
    return last.toISOString().slice(0, 10);
  }
  const first = new Date(Date.UTC(year, month, 1));
  const d = new Date(Date.UTC(year, month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1)));
  return d.getUTCMonth() === month ? d.toISOString().slice(0, 10) : null;
}
