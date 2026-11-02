import { Hono } from "hono";
import { Card, CARD_CSS, fromForm, missing, RuleSelect } from "./event-card";
import type { ExtractedEvent } from "./extraction/extract";
import { Layout } from "./layout";
import { columns, findVenue, venueQuery } from "./publish";
import {
  addDays,
  applyTemplate,
  changeRule,
  endSeries,
  HORIZON_DAYS,
  ruleDates,
  ruleValue,
  signOfLife,
  templateOf,
  type Rule,
  type Template,
} from "./series";
import { berlinDate } from "./whatsapp/bot";
import { guessVenue } from "./whatsapp/questions";
import { formatDate } from "./whatsapp/summary";

// The target of a Series' private link (/s/<token>, no login), sent in the "✅ Ist online!" reply: change
// the rule or the shared fields for the dates ahead, end the Series, or open a single date's own edit
// link to change or cancel just that one. Every save counts as a sign of life (ADR 0001).

type Row = {
  id: number;
  rule: string;
  template: string;
  registration_required: number;
  last_sign_of_life: string;
  ended_at: string | null;
  venue: string;
  address: string | null;
};

type Occurrence = { starts_at: string; cancelled: number; detached: number; edit_token: string };

export const seriesPage = new Hono<{ Bindings: Env }>();

seriesPage.get("/:token", async (c) => {
  const s = await load(c.env.DB, c.req.param("token"));
  if (!s) return c.notFound();
  const today = berlinDate(new Date());
  const dates = await occurrences(c.env.DB, s.id, today);
  return c.html(<SeriesPage token={c.req.param("token")} s={s} event={toCard(s, dates, today)} dates={dates} today={today} />);
});

seriesPage.post("/:token", async (c) => {
  const token = c.req.param("token");
  const s = await load(c.env.DB, token);
  if (!s) return c.notFound();
  const today = berlinDate(new Date());
  const before = toCard(s, await occurrences(c.env.DB, s.id, today), today);
  if (s.ended_at) return c.html(<SeriesPage token={token} s={s} event={before} dates={[]} today={today} />, 409);
  const e = fromForm(await c.req.formData(), 0, before);
  const red = missing(e, today);
  if (Object.keys(red).length) {
    return c.html(<SeriesPage token={token} s={s} event={e} dates={await occurrences(c.env.DB, s.id, today)} today={today} red={red} />, 422);
  }

  if (venueQuery(e) && !(await findVenue(c.env.DB, e))) await guessVenue(c.env, e); // a new Venue's coordinates
  const old = JSON.parse(s.rule) as Rule;
  const rule = e.series_rule ? { ...e.series_rule, anchor: e.start_date } : old;
  if (ruleValue(rule) !== ruleValue(old) || e.start_date !== before.start_date) await changeRule(c.env.DB, s.id, rule, today);
  const template = JSON.parse(s.template) as Template;
  await applyTemplate(c.env.DB, s.id, templateOf(await columns(c.env.DB, e), template.description, template.flyer_key), today);
  await signOfLife(c.env.DB, s.id, today);

  const saved = (await load(c.env.DB, token))!;
  const dates = await occurrences(c.env.DB, s.id, today);
  return c.html(<SeriesPage token={token} s={saved} event={toCard(saved, dates, today)} dates={dates} today={today} saved />);
});

seriesPage.post("/:token/end", async (c) => {
  const s = await load(c.env.DB, c.req.param("token"));
  if (!s) return c.notFound();
  await endSeries(c.env.DB, s.id, berlinDate(new Date()));
  return c.redirect(`/s/${c.req.param("token")}`, 303);
});

// A removed (blocked) Organizer's links stop working.
async function load(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT s.id, s.rule, s.template, s.registration_required, s.last_sign_of_life, s.ended_at, v.name AS venue, v.address
       FROM series s JOIN venue v ON v.id = json_extract(s.template, '$.venue_id') LEFT JOIN organizer o ON o.id = s.organizer_id
       WHERE s.edit_token = ? AND o.blocked_at IS NULL`,
    )
    .bind(token)
    .first<Row>();
}

async function occurrences(db: D1Database, seriesId: number, today: string): Promise<Occurrence[]> {
  const { results } = await db
    .prepare("SELECT starts_at, cancelled, detached, edit_token FROM event WHERE series_id = ? AND starts_at >= ? ORDER BY starts_at")
    .bind(seriesId, today)
    .all<Occurrence>();
  return results;
}

// The Template in the card's fields. The date is the next one the rule gives: changing it moves the Series.
function toCard(s: Row, dates: Occurrence[], today: string): ExtractedEvent {
  const t = JSON.parse(s.template) as Template;
  const rule = JSON.parse(s.rule) as Rule;
  const next =
    dates.find((d) => !d.detached)?.starts_at.slice(0, 10) ?? ruleDates(rule, addDays(today, -1), addDays(today, 400))[0] ?? today;
  return {
    title: t.title,
    type: t.type,
    styles: JSON.parse(t.styles),
    start_date: next,
    weekday_on_flyer: "",
    year_on_flyer: next.slice(0, 4), // a published date is settled
    start_time: t.start_time,
    intro_class_time: t.intro_class_time,
    end_date: "",
    end_time: t.end_time,
    venue_name: s.venue,
    venue_address: s.address ?? "",
    city: "",
    price_text: t.price ?? "",
    level: t.level ?? "",
    registration_required: s.registration_required === 1,
    description: t.description ?? "",
    series: { is_series: true, rule_text: "", frequency: "none", explicit_dates: [] },
    uncertain_fields: [],
    notes: "",
    series_rule: rule,
  };
}

function SeriesPage(props: {
  token: string;
  s: Row;
  event: ExtractedEvent;
  dates: Occurrence[];
  today: string;
  red?: ReturnType<typeof missing>;
  saved?: boolean;
}) {
  const { token, s, event, today } = props;
  if (s.ended_at) {
    return (
      <Layout title={`${event.title} – DanceCalendar`}>
        <h1>{event.title}</h1>
        <p class="ended">Diese Serie ist beendet. Für neue Termine schick einfach wieder einen Flyer.</p>
      </Layout>
    );
  }
  const until = addDays(s.last_sign_of_life, HORIZON_DAYS);
  return (
    <Layout title={`${event.title} – DanceCalendar`} head={<style>{CARD_CSS + CSS}</style>}>
      <h1>Serie bearbeiten</h1>
      {props.saved && <p class="saved">✅ Gespeichert – gilt für alle kommenden Termine außer einzeln geänderten.</p>}
      {s.registration_required ? <p>Kurs mit Anmeldung.</p> : null}
      <form method="post">
        <Card
          i={0}
          e={event}
          red={props.red ?? {}}
          yellow={new Map()}
          hidden={["city", "end_date"]}
          series={<RuleSelect i={0} e={event} rule={event.series_rule ?? null} />}
        />
        <p class="hint">„Datum“ ist der nächste Termin. Änderst du es oder die Wiederholung, beginnt die Serie dort neu.</p>
        <button type="submit" name="save" class="publish">
          Speichern
        </button>
      </form>

      <h2>Kommende Termine</h2>
      <p class="hint">
        Eingetragen bis {formatDate(until, today)} – jede Änderung hier und jeder neue Flyer verlängert die Serie um 12 Wochen.
      </p>
      <ul class="dates">
        {props.dates.map((d) => (
          <li>
            <a href={`/e/${d.edit_token}`}>
              {formatDate(d.starts_at.slice(0, 10), today)} · {d.starts_at.slice(11)}
            </a>
            {d.cancelled ? " – abgesagt" : ""}
            {d.detached ? " – einzeln geändert" : ""}
          </li>
        ))}
      </ul>
      <p class="hint">Einen Termin einzeln ändern oder absagen: antippen.</p>

      <form method="post" action={`/s/${token}/end`} onsubmit="return confirm('Serie wirklich beenden? Alle kommenden Termine werden gelöscht.')">
        <button type="submit" class="secondary">
          Serie beenden
        </button>
      </form>
      <p class="hint">Dieser Link ist privat – nicht weiterleiten.</p>
    </Layout>
  );
}

const CSS = `
  .saved { background: #e6f4ea; border-radius: 6px; padding: .5rem; }
  .dates { padding-left: 1.2rem; }
  .dates li { margin: .3rem 0; }
  .secondary { width: 100%; margin-top: 1.5rem; padding: .6rem; font: inherit; border: 1px solid #e4dfd8; border-radius: 8px; background: #fff; }
`;
