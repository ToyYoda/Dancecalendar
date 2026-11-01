import { Hono } from "hono";
import { duplicatesOfEvent } from "./duplicates";
import { Card, CARD_CSS, fromForm, missing } from "./event-card";
import type { ExtractedEvent } from "./extraction/extract";
import { Layout } from "./layout";
import { columns } from "./publish";
import { queueUpload, waitForUpload } from "./upload";
import { berlinDate } from "./whatsapp/bot";

// The target of an Event's private edit link (/e/<token>, no login): change any field with the confirm
// page's card, cancel the Event (it stays in the feed, marked) or take that back, and upload another
// Flyer, which goes to the confirm page and is published under the same Organizer.
// Likely duplicates are warned about, never blocked. Series-wide edits come with ticket 22.

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
  display_name: string | null;
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

  const col = await columns(c.env.DB, e);
  await c.env.DB.prepare(
    `UPDATE event SET title = ?, type = ?, styles = ?, starts_at = ?, ends_at = ?, intro_class_at = ?, level = ?, price = ?, venue_id = ?
     WHERE id = ?`,
  )
    .bind(col.title, col.type, col.styles, col.starts_at, col.ends_at, col.intro_class_at, col.level, col.price, col.venue_id, row.id)
    .run();
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
  return e?.organizer_id ? c.html(<UploadForm token={c.req.param("token")} displayName={e.display_name!} />) : c.notFound();
});

editPage.post("/:token/upload", async (c) => {
  const token = c.req.param("token");
  const e = await load(c.env.DB, token);
  if (!e?.organizer_id) return c.notFound();
  const confirm = await queueUpload(c.env, (await c.req.parseBody()).flyer, e.organizer_id, "web");
  if (!confirm) return c.html(<UploadForm token={token} displayName={e.display_name!} error="Bitte ein Bild wählen (JPEG, PNG oder WebP)." />, 400);
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
              e.flyer_key, e.cancelled, v.name AS venue, v.address, e.organizer_id, o.display_name
       FROM event e JOIN venue v ON v.id = e.venue_id LEFT JOIN organizer o ON o.id = e.organizer_id
       WHERE e.edit_token = ? AND o.blocked_at IS NULL`,
    )
    .bind(token)
    .first<Row>();
}

async function setCancelled(db: D1Database, token: string, cancelled: 0 | 1): Promise<boolean> {
  const e = await load(db, token);
  if (!e) return false;
  await db.prepare("UPDATE event SET cancelled = ? WHERE id = ?").bind(cancelled, e.id).run();
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
    <Layout title={`${row.title} – DanceCalendar`} head={<style>{CARD_CSS + CSS}</style>}>
      <h1>Event bearbeiten</h1>
      {props.saved && <p class="saved">✅ Gespeichert.</p>}
      {row.cancelled ? <p class="cancelled">❌ Abgesagt – steht im Kalender als „abgesagt“.</p> : null}
      {row.flyer_key && <img class="flyer" src={`/e/${token}/flyer`} alt="Flyer" />}
      <form method="post">
        <Card i={0} e={props.event} red={props.red ?? {}} yellow={new Map()} warnings={props.warnings} hidden={["city"]} />
        <button type="submit" name="save" class="publish">
          Speichern
        </button>
      </form>
      {row.cancelled ? (
        <form method="post" action={`/e/${token}/reinstate`}>
          <button type="submit" class="secondary">
            Absage zurücknehmen
          </button>
        </form>
      ) : (
        <form method="post" action={`/e/${token}/cancel`} onsubmit="return confirm('Event wirklich absagen?')">
          <button type="submit" class="secondary">
            Event absagen
          </button>
        </form>
      )}
      {row.organizer_id && (
        <p>
          Neues Event? <a href={`/e/${token}/upload`}>Flyer hochladen</a>
        </p>
      )}
      <p class="hint">Dieser Link ist privat – nicht weiterleiten.</p>
    </Layout>
  );
}

function UploadForm(props: { token: string; displayName: string; error?: string }) {
  return (
    <Layout title="Flyer hochladen – DanceCalendar">
      <h1>Flyer hochladen</h1>
      {props.error && <p style="color:#a30000">{props.error}</p>}
      <p>
        Ich lese den Flyer aus, du prüfst alles, und es wird als <strong>{props.displayName}</strong> veröffentlicht.
      </p>
      <form method="post" enctype="multipart/form-data">
        <p>
          <input type="file" name="flyer" accept="image/jpeg,image/png,image/webp" required />
        </p>
        <button type="submit">Hochladen und auslesen</button>
      </form>
      <p>
        <a href={`/e/${props.token}`}>Zurück</a>
      </p>
    </Layout>
  );
}

const CSS = `
  .saved { background: #e6f4ea; border-radius: 6px; padding: .5rem; }
  .cancelled { background: #fde2e2; border-radius: 6px; padding: .5rem; font-weight: bold; }
  .secondary { width: 100%; margin-top: .75rem; padding: .6rem; font: inherit; border: 1px solid #e4dfd8; border-radius: 8px; background: #fff; }
`;
