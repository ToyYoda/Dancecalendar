import { Hono } from "hono";
import { duplicatesOfEvent } from "./duplicates";
import { Card, CARD_CSS, fromForm, missing } from "./event-card";
import type { ExtractedEvent } from "./extraction/extract";
import { SitePage } from "./site";
import { columns, findVenue, venueQuery } from "./publish";
import { signOfLife } from "./series";
import { queueUpload, waitForUpload } from "./upload";
import { berlinDate } from "./whatsapp/bot";
import { guessVenue } from "./whatsapp/questions";

// The target of an Event's private edit link (/e/<token>, no login): change any field with the confirm
// page's card, cancel the Event (it stays in the feed, marked) or take that back, and upload another
// Flyer, which goes to the confirm page and is published under the same Organizer.
// Likely duplicates are warned about, never blocked. A Series' date changed here stays as it is when the
// whole Series is edited (src/series-page.tsx), and every change counts as the Series' sign of life.

type Row = {
  id: number;
  title: string;
  type: ExtractedEvent["type"];
  styles: string;
  starts_at: string;
  ends_at: string | null;
  intro_class_at: string | null;
  level: string | null;
  price: string | null;
  description: string | null;
  flyer_key: string | null;
  cancelled: number;
  venue: string;
  address: string | null;
  organizer_id: number | null;
  organizer_name: string | null;
  series_id: number | null;
  series_token: string | null;
};

export const editPage = new Hono<{ Bindings: Env }>();

editPage.get("/:token", async (c) => {
  const e = await load(c.env.DB, c.req.param("token"));
  if (!e) return c.notFound();
  return c.html(<EditPage token={c.req.param("token")} row={e} event={toCard(e)} warnings={await duplicatesOfEvent(c.env.DB, e.id)} />);
});

editPage.post("/:token", async (c) => {
  const token = c.req.param("token");
  const row = await load(c.env.DB, token);
  if (!row) return c.notFound();
  const e = fromForm(await c.req.formData(), 0, toCard(row));
  const red = missing(e, berlinDate(new Date()));
  if (Object.keys(red).length) return c.html(<EditPage token={token} row={row} event={e} red={red} warnings={[]} />, 422);

  if (venueQuery(e) && !(await findVenue(c.env.DB, e))) await guessVenue(c.env, e); // a new Venue's coordinates
  const col = await columns(c.env.DB, e);
  await c.env.DB.prepare(
    `UPDATE event SET title = ?, type = ?, styles = ?, starts_at = ?, ends_at = ?, intro_class_at = ?, level = ?, price = ?, venue_id = ?,
                      detached = series_id IS NOT NULL
     WHERE id = ?`,
  )
    .bind(col.title, col.type, col.styles, col.starts_at, col.ends_at, col.intro_class_at, col.level, col.price, col.venue_id, row.id)
    .run();
  if (row.series_id) await signOfLife(c.env.DB, row.series_id, berlinDate(new Date()));
  const saved = (await load(c.env.DB, token))!;
  return c.html(<EditPage token={token} row={saved} event={toCard(saved)} warnings={await duplicatesOfEvent(c.env.DB, row.id)} saved />);
});

editPage.post("/:token/cancel", (c) => setCancelled(c.env.DB, c.req.param("token"), 1).then((ok) => (ok ? c.redirect(`/e/${c.req.param("token")}`, 303) : c.notFound())));
editPage.post("/:token/reinstate", (c) => setCancelled(c.env.DB, c.req.param("token"), 0).then((ok) => (ok ? c.redirect(`/e/${c.req.param("token")}`, 303) : c.notFound())));

editPage.get("/:token/flyer", async (c) => {
  const e = await load(c.env.DB, c.req.param("token"));
  const object = e?.flyer_key && (await c.env.FLYERS.get(e.flyer_key));
  if (!object) return c.notFound();
  return c.body(object.body, 200, { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private" });
});

editPage.get("/:token/upload", async (c) => {
  const e = await load(c.env.DB, c.req.param("token"));
  return e?.organizer_id ? c.html(<UploadForm token={c.req.param("token")} organizerName={e.organizer_name!} />) : c.notFound();
});

editPage.post("/:token/upload", async (c) => {
  const token = c.req.param("token");
  const e = await load(c.env.DB, token);
  if (!e?.organizer_id) return c.notFound();
  const confirm = await queueUpload(c.env, (await c.req.parseBody()).flyer, e.organizer_id, "web");
  if (!confirm) return c.html(<UploadForm token={token} organizerName={e.organizer_name!} error="Bitte ein Bild wählen (JPEG, PNG oder WebP)." />, 400);
  return c.redirect(`/e/${token}/upload/${confirm}`, 303);
});

editPage.get("/:token/upload/:confirm", async (c) => {
  const token = c.req.param("token");
  const e = await load(c.env.DB, token);
  if (!e?.organizer_id) return c.notFound();
  return waitForUpload(c, c.req.param("confirm"), e.organizer_id, `/e/${token}/upload`);
});

// A removed (blocked) Organizer's links stop working.
async function load(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT e.id, e.title, e.type, e.styles, e.starts_at, e.ends_at, e.intro_class_at, e.level, e.price, e.description,
              e.flyer_key, e.cancelled, v.name AS venue, v.address, e.organizer_id, o.name AS organizer_name, e.series_id, s.edit_token AS series_token
       FROM event e JOIN venue v ON v.id = e.venue_id LEFT JOIN organizer o ON o.id = e.organizer_id LEFT JOIN series s ON s.id = e.series_id
       WHERE e.edit_token = ? AND o.blocked_at IS NULL`,
    )
    .bind(token)
    .first<Row>();
}

async function setCancelled(db: D1Database, token: string, cancelled: 0 | 1): Promise<boolean> {
  const e = await load(db, token);
  if (!e) return false;
  await db.prepare("UPDATE event SET cancelled = ? WHERE id = ?").bind(cancelled, e.id).run();
  if (e.series_id) await signOfLife(db, e.series_id, berlinDate(new Date()));
  return true;
}

// The stored Event in the card's fields; publish.ts `columns` turns them back. The Venue's whole
// address goes into one field, so the card hides "Stadt".
function toCard(e: Row): ExtractedEvent {
  const date = e.starts_at.slice(0, 10);
  const time = e.starts_at.slice(11);
  let end_date = "";
  let end_time = "";
  if (e.ends_at) {
    const [d, t] = [e.ends_at.slice(0, 10), e.ends_at.slice(11)];
    if (d === date || (d === nextDay(date) && t < time)) end_time = t;
    else [end_date, end_time] = [d, t === "23:59" ? "" : t];
  }
  return {
    title: e.title,
    type: e.type,
    styles: JSON.parse(e.styles),
    start_date: date,
    weekday_on_flyer: "",
    year_on_flyer: date.slice(0, 4), // a published date is settled
    start_time: time,
    intro_class_time: e.intro_class_at?.slice(11) ?? "",
    end_date,
    end_time,
    venue_name: e.venue,
    venue_address: e.address ?? "",
    city: "",
    price_text: e.price ?? "",
    level: e.level ?? "",
    registration_required: false,
    description: e.description ?? "",
    series: { is_series: false, rule_text: "", frequency: "none", explicit_dates: [] },
    uncertain_fields: [],
    notes: "",
  };
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function EditPage(props: {
  token: string;
  row: Row;
  event: ExtractedEvent;
  red?: ReturnType<typeof missing>;
  warnings: string[];
  saved?: boolean;
}) {
  const { token, row } = props;
  return (
    <SitePage title={row.title} css={CARD_CSS + CSS}>
      <h1>Event bearbeiten</h1>
      {props.saved && <p class="note">Gespeichert. Der Kalender zeigt schon die neue Fassung.</p>}
      {row.cancelled ? <p class="note bad">Abgesagt. Im Kalender steht das Event als „abgesagt“.</p> : null}
      {row.series_token && (
        <p class="note">
          Ein Termin einer Serie. Änderungen hier gelten nur für diesen Tag.{" "}
          <a class="about" href={`/s/${row.series_token}`}>
            Ganze Serie bearbeiten
          </a>
        </p>
      )}
      {row.flyer_key && <img class="flyer" src={`/e/${token}/flyer`} alt="Flyer" />}
      <form method="post">
        <Card i={0} e={props.event} red={props.red ?? {}} yellow={new Map()} warnings={props.warnings} hidden={["city"]} />
        <button type="submit" name="save" class="publish">
          Speichern
        </button>
      </form>
      {row.cancelled ? (
        <form method="post" action={`/e/${token}/reinstate`}>
          <button type="submit" class="btn wide" style="margin-top:12px">
            Absage zurücknehmen
          </button>
        </form>
      ) : (
        <form method="post" action={`/e/${token}/cancel`} onsubmit="return confirm('Event wirklich absagen?')">
          <button type="submit" class="btn danger wide" style="margin-top:12px">
            Event absagen
          </button>
        </form>
      )}
      {row.organizer_id && (
        <p style="margin-top:20px">
          Neues Event?{" "}
          <a class="about" href={`/e/${token}/upload`}>
            Flyer hochladen
          </a>
        </p>
      )}
      <p class="hint">Dieser Link ist privat, bitte nicht weiterleiten.</p>
    </SitePage>
  );
}

function UploadForm(props: { token: string; organizerName: string; error?: string }) {
  return (
    <SitePage title="Flyer hochladen">
      <a class="back" href={`/e/${props.token}`}>
        ← Zurück
      </a>
      <h1>Flyer hochladen</h1>
      {props.error && <p class="note bad">{props.error}</p>}
      <p class="lead">
        DanceAhead liest den Flyer aus, du prüfst alles, und es erscheint als <b>{props.organizerName}</b>.
      </p>
      <form method="post" enctype="multipart/form-data" class="stack">
        <label class="drop">
          <input type="file" name="flyer" accept="image/jpeg,image/png,image/webp" required />
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <b>Flyer wählen</b>
          <small>Foto oder Screenshot</small>
        </label>
        <button class="btn solid wide" type="submit">
          Hochladen und auslesen
        </button>
      </form>
    </SitePage>
  );
}

const CSS = `
  .wrap > form > .publish { margin-top:4px; }
`;
