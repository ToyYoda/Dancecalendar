import { Hono } from "hono";
import { geocode, type Place } from "./geocode";
import { Layout } from "./layout";
import { normalize } from "./publish";
import { addDays, endSeries, HORIZON_DAYS, signOfLife } from "./series";
import { berlinDate } from "./whatsapp/bot";
import { formatDate } from "./whatsapp/summary";

// The Admin's tools, mounted under /admin behind its password. Mobile-first lists:
// - /organizers: newest first; "Entfernen" blocks the number, deletes the Organizer's future Events and
//   ends their Series (past Events stay). Unblocking is done by hand in the database.
// - /events: search, upcoming first; each opens a page with the Organizer's edit link and the two
//   Admin-only actions "Organizer zuweisen" (a Tip Event, or a whole Series) and "Flyer entfernen".
// - /series: running Series that run out within 4 weeks, with "12 Wochen verlängern" (a sign of life).
// - /venues: correct a Venue's name, address and coordinates, which Organizers can't change.
// Decisions: .scratch/dance-calendar-mvp/issues/11-admin-view.md

export const adminTools = new Hono<{ Bindings: Env }>();

const ENDING_WITHIN = 28; // days: the /series list
// The day a Series runs out: 12 weeks after its last sign of life (ADR 0001).
const RUNS_OUT = `date(last_sign_of_life, '+${HORIZON_DAYS} days')`;

// ---- Organizers ----

type OrganizerRow = {
  id: number;
  display_name: string;
  first_name: string | null;
  whatsapp_number: string;
  created_at: string;
  blocked_at: string | null;
  upcoming: number;
  shares_name: number;
};

adminTools.get("/organizers", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.display_name, o.first_name, o.whatsapp_number, o.created_at, o.blocked_at,
            (SELECT COUNT(*) FROM event e WHERE e.organizer_id = o.id AND e.starts_at >= ?) AS upcoming,
            EXISTS (SELECT 1 FROM organizer p WHERE p.display_name = o.display_name AND p.id <> o.id) AS shares_name
     FROM organizer o ORDER BY o.created_at DESC, o.id DESC`,
  )
    .bind(berlinDate(new Date()))
    .all<OrganizerRow>();
  return c.html(
    <Layout title="Organizer – DanceCalendar">
      <Back />
      <h1>Organizer</h1>
      {results.length === 0 && <p>Noch keine Organizer.</p>}
      <ul>
        {results.map((o) => (
          <li>
            <strong>{o.display_name}</strong> ({o.first_name ?? "?"}) · +{o.whatsapp_number.replace(/^\+/, "")}
            <br />
            <small>
              seit {o.created_at.slice(0, 10)} · {o.upcoming} kommende Events
              {o.shares_name ? " · teilt den Display name mit anderen" : ""}
            </small>
            {o.blocked_at ? (
              <p style="color:#a30000">entfernt am {o.blocked_at.slice(0, 10)}</p>
            ) : (
              <form
                method="post"
                action={`/admin/organizers/${o.id}/remove`}
                onsubmit={`return confirm('${o.display_name.replace(/['\\]/g, "")} entfernen? Die Nummer wird gesperrt, alle kommenden Events und Serien werden gelöscht.')`}
              >
                <button type="submit">Entfernen</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

adminTools.post("/organizers/:id/remove", async (c) => {
  await removeOrganizer(c.env, Number(c.req.param("id")), berlinDate(new Date()));
  return c.redirect("/admin/organizers", 303);
});

// Blocks the number (the bot refuses it) and deletes everything of theirs still to come.
export async function removeOrganizer(env: Env, id: number, today: string) {
  const { meta } = await env.DB.prepare("UPDATE organizer SET blocked_at = datetime('now') WHERE id = ? AND blocked_at IS NULL").bind(id).run();
  if (meta.changes !== 1) return;
  const { results: series } = await env.DB.prepare("SELECT id FROM series WHERE organizer_id = ? AND ended_at IS NULL").bind(id).all<{ id: number }>();
  for (const s of series) await endSeries(env.DB, s.id, today);
  const [events, held] = await env.DB.batch<{ flyer_key: string | null }>([
    env.DB.prepare("DELETE FROM event WHERE organizer_id = ? AND starts_at >= ? RETURNING flyer_key").bind(id, today),
    env.DB.prepare("DELETE FROM submission WHERE organizer_id = ? AND status = 'pending' RETURNING flyer_key").bind(id),
  ]);
  await deleteUnusedFlyers(env, [...events.results, ...held.results].map((r) => r.flyer_key));
}

// Deletes the Flyer images nothing refers to any more: no Event, Series or held Flyer.
async function deleteUnusedFlyers(env: Env, keys: (string | null)[]) {
  for (const key of new Set(keys.filter((k): k is string => Boolean(k)))) {
    const used = await env.DB.prepare(
      `SELECT 1 FROM event WHERE flyer_key = ?1
       UNION ALL SELECT 1 FROM series WHERE json_extract(template, '$.flyer_key') = ?1 AND ended_at IS NULL
       UNION ALL SELECT 1 FROM submission WHERE flyer_key = ?1 AND status = 'pending' LIMIT 1`,
    )
      .bind(key)
      .first();
    if (!used) await env.FLYERS.delete(key);
  }
}

// ---- Events ----

type EventRow = {
  id: number;
  title: string;
  starts_at: string;
  cancelled: number;
  is_tip: number;
  flyer_key: string | null;
  edit_token: string;
  series_id: number | null;
  series_token: string | null;
  venue: string;
  posted_by: string | null;
};

const EVENT_SELECT = `
  SELECT e.id, e.title, e.starts_at, e.cancelled, e.is_tip, e.flyer_key, e.edit_token, e.series_id, s.edit_token AS series_token,
         v.name AS venue, COALESCE(o.display_name, e.shown_as) AS posted_by
  FROM event e JOIN venue v ON v.id = e.venue_id LEFT JOIN organizer o ON o.id = e.organizer_id LEFT JOIN series s ON s.id = e.series_id`;

adminTools.get("/events", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const today = berlinDate(new Date());
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const { results } = await c.env.DB.prepare(
    `${EVENT_SELECT}
     WHERE ?1 = '' OR e.title LIKE ?2 ESCAPE '\\' OR v.name LIKE ?2 ESCAPE '\\' OR o.display_name LIKE ?2 ESCAPE '\\' OR e.shown_as LIKE ?2 ESCAPE '\\'
     ORDER BY e.starts_at < ?3, CASE WHEN e.starts_at >= ?3 THEN e.starts_at END, e.starts_at DESC LIMIT 50`,
  )
    .bind(q, like, today)
    .all<EventRow>();
  return c.html(
    <Layout title="Events – DanceCalendar">
      <Back />
      <h1>Events</h1>
      <form method="get">
        <input name="q" value={q} placeholder="Titel, Organizer oder Ort" type="search" />
        <button type="submit">Suchen</button>
      </form>
      {results.length === 0 && <p>Keine Events gefunden.</p>}
      <ul>
        {results.map((e) => (
          <li style={e.starts_at < today ? "opacity:.6" : ""}>
            <a href={`/admin/events/${e.id}`}>
              <strong>{e.title}</strong>
            </a>{" "}
            – {formatDate(e.starts_at.slice(0, 10), today)}
            <br />
            <small>
              {e.posted_by ?? "?"} · {e.venue}
              {e.is_tip ? " · Tipp" : ""}
              {e.series_id ? " · Serie" : ""}
              {e.cancelled ? " · abgesagt" : ""}
            </small>
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

adminTools.get("/events/:id", async (c) => {
  const e = await loadEvent(c.env.DB, Number(c.req.param("id")));
  return e ? c.html(<EventPage e={e} organizers={await activeOrganizers(c.env.DB)} />) : c.notFound();
});

// A Tip Event becomes the Organizer's; for an Event of a Series, the whole Series and its Events do.
adminTools.post("/events/:id/assign", async (c) => {
  const e = await loadEvent(c.env.DB, Number(c.req.param("id")));
  if (!e) return c.notFound();
  const organizers = await activeOrganizers(c.env.DB);
  const { organizer_id } = await c.req.parseBody();
  const chosen = organizers.find((o) => String(o.id) === String(organizer_id));
  if (!chosen) return c.html(<EventPage e={e} organizers={organizers} error="Bitte einen (nicht entfernten) Organizer wählen." />, 422);
  const db = c.env.DB;
  if (e.series_id) {
    await db.batch([
      db.prepare("UPDATE series SET organizer_id = ?, shown_as = NULL WHERE id = ?").bind(chosen.id, e.series_id),
      db.prepare("UPDATE event SET organizer_id = ?, is_tip = 0, shown_as = NULL WHERE series_id = ?").bind(chosen.id, e.series_id),
    ]);
  } else {
    await db.prepare("UPDATE event SET organizer_id = ?, is_tip = 0, shown_as = NULL WHERE id = ?").bind(chosen.id, e.id).run();
  }
  return c.redirect(`/admin/events/${e.id}`, 303);
});

// Deletes the image and keeps the Events: every Event and Series that shows it loses it.
adminTools.post("/events/:id/flyer/remove", async (c) => {
  const e = await loadEvent(c.env.DB, Number(c.req.param("id")));
  if (!e) return c.notFound();
  if (e.flyer_key) {
    const db = c.env.DB;
    await db.batch([
      db.prepare("UPDATE event SET flyer_key = NULL WHERE flyer_key = ?").bind(e.flyer_key),
      db.prepare("UPDATE series SET template = json_set(template, '$.flyer_key', NULL) WHERE json_extract(template, '$.flyer_key') = ?").bind(e.flyer_key),
    ]);
    await c.env.FLYERS.delete(e.flyer_key);
  }
  return c.redirect(`/admin/events/${e.id}`, 303);
});

function loadEvent(db: D1Database, id: number) {
  return db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).bind(id).first<EventRow>();
}

async function activeOrganizers(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, display_name, first_name FROM organizer WHERE blocked_at IS NULL ORDER BY display_name, first_name")
    .all<{ id: number; display_name: string; first_name: string | null }>();
  return results;
}

function EventPage(props: { e: EventRow; organizers: { id: number; display_name: string; first_name: string | null }[]; error?: string }) {
  const { e } = props;
  const today = berlinDate(new Date());
  return (
    <Layout title={`${e.title} – DanceCalendar Admin`}>
      <p>
        <a href="/admin/events">← Events</a>
      </p>
      <h1>{e.title}</h1>
      <p>
        {formatDate(e.starts_at.slice(0, 10), today)} {e.starts_at.slice(11)} · {e.venue}
        <br />
        {e.is_tip ? `Tipp, gezeigt als „${e.posted_by ?? "?"}“` : `von ${e.posted_by ?? "?"}`}
        {e.cancelled ? " · abgesagt" : ""}
      </p>
      <p>
        <a href={`/e/${e.edit_token}`}>Bearbeiten (Edit-Seite des Organizers)</a>
        {e.series_token && (
          <>
            {" · "}
            <a href={`/s/${e.series_token}`}>Serie bearbeiten</a>
          </>
        )}
      </p>
      {props.error && <p style="color:#a30000">{props.error}</p>}
      {(e.is_tip || e.series_id) && (
        <form method="post" action={`/admin/events/${e.id}/assign`}>
          <h2>Organizer zuweisen{e.series_id ? " (ganze Serie)" : ""}</h2>
          <select name="organizer_id" required>
            {props.organizers.map((o) => (
              <option value={String(o.id)}>
                {o.display_name} ({o.first_name ?? "?"})
              </option>
            ))}
          </select>{" "}
          <button type="submit">Zuweisen</button>
        </form>
      )}
      <h2>Flyer</h2>
      {e.flyer_key ? (
        <form method="post" action={`/admin/events/${e.id}/flyer/remove`} onsubmit="return confirm('Flyer-Bild löschen? Alle Events mit diesem Flyer verlieren ihn.')">
          <img src={`/e/${e.edit_token}/flyer`} alt="Flyer" style="max-width:100%; max-height:20rem; display:block; margin-bottom:.5rem" />
          <button type="submit">Flyer entfernen</button>
        </form>
      ) : (
        <p>Kein Flyer.</p>
      )}
    </Layout>
  );
}

// ---- Series ending soon ----

type EndingRow = { id: number; title: string; runs_out: string; edit_token: string; posted_by: string | null };

// Running Series (not waiting for the Admin's rule check) that run out from today to `until`.
export async function seriesEnding(db: D1Database, today: string, until: string) {
  const { results } = await db
    .prepare(
      `SELECT s.id, json_extract(s.template, '$.title') AS title, ${RUNS_OUT} AS runs_out, s.edit_token,
              COALESCE(o.display_name, s.shown_as) AS posted_by
       FROM series s LEFT JOIN organizer o ON o.id = s.organizer_id
       WHERE s.ended_at IS NULL AND json_extract(s.rule, '$.freq') <> 'custom' AND ${RUNS_OUT} BETWEEN ? AND ?
       ORDER BY runs_out, s.id`,
    )
    .bind(today, until)
    .all<EndingRow>();
  return results;
}

adminTools.get("/series", async (c) => {
  const today = berlinDate(new Date());
  const series = await seriesEnding(c.env.DB, today, addDays(today, ENDING_WITHIN));
  return c.html(
    <Layout title="Serien – DanceCalendar">
      <Back />
      <h1>Serien, die bald auslaufen</h1>
      <p>Serien laufen 12 Wochen nach dem letzten Lebenszeichen aus. Hier stehen die der nächsten 4 Wochen.</p>
      {series.length === 0 && <p>Keine.</p>}
      <ul>
        {series.map((s) => (
          <li>
            <a href={`/s/${s.edit_token}`}>
              <strong>{s.title}</strong>
            </a>{" "}
            · {s.posted_by ?? "?"}
            <br />
            <small>läuft aus am {formatDate(s.runs_out, today)}</small>
            <form method="post" action={`/admin/series/${s.id}/extend`}>
              <button type="submit">12 Wochen verlängern</button>
            </form>
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

adminTools.post("/series/:id/extend", async (c) => {
  await signOfLife(c.env.DB, Number(c.req.param("id")), berlinDate(new Date()));
  return c.redirect("/admin/series", 303);
});

// ---- Venues ----

type VenueRow = { id: number; name: string; address: string | null; lat: number | null; lng: number | null };
type VenueForm = { name: string; address: string; lat: string; lng: string };

adminTools.get("/venues", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, address, lat, lng FROM venue
     WHERE ?1 = '' OR name LIKE ?2 ESCAPE '\\' OR address LIKE ?2 ESCAPE '\\'
     ORDER BY lat IS NOT NULL, name LIMIT 100`,
  )
    .bind(q, like)
    .all<VenueRow>();
  return c.html(
    <Layout title="Orte – DanceCalendar">
      <Back />
      <h1>Orte</h1>
      <form method="get">
        <input name="q" value={q} placeholder="Name oder Adresse" type="search" />
        <button type="submit">Suchen</button>
      </form>
      <ul>
        {results.map((v) => (
          <li>
            <a href={`/admin/venues/${v.id}`}>
              <strong>{v.name}</strong>
            </a>
            <br />
            <small>
              {v.address ?? "ohne Adresse"}
              {v.lat === null ? " · ohne Koordinaten" : ""}
            </small>
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

adminTools.get("/venues/:id", async (c) => {
  const v = await c.env.DB.prepare("SELECT id, name, address, lat, lng FROM venue WHERE id = ?").bind(Number(c.req.param("id"))).first<VenueRow>();
  if (!v) return c.notFound();
  const form = { name: v.name, address: v.address ?? "", lat: v.lat === null ? "" : String(v.lat), lng: v.lng === null ? "" : String(v.lng) };
  return c.html(<VenuePage id={v.id} form={form} saved={c.req.query("saved") === "1"} />);
});

// "Adresse suchen" fills in the coordinates the geocoder finds; nothing is saved until "Speichern".
adminTools.post("/venues/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = c.env.DB;
  if (!(await db.prepare("SELECT 1 FROM venue WHERE id = ?").bind(id).first())) return c.notFound();
  const body = await c.req.parseBody();
  const field = (name: string) => String(body[name] ?? "").replace(/\s+/g, " ").trim();
  const form: VenueForm = { name: field("name").slice(0, 120), address: field("address").slice(0, 200), lat: field("lat"), lng: field("lng") };

  if (body.action === "geocode") {
    const place = await geocode(c.env, { name: form.name, address: form.address, city: "" });
    if (!place) return c.html(<VenuePage id={id} form={form} error="Nichts gefunden. Adresse genauer eingeben oder Koordinaten selbst eintragen." />);
    return c.html(<VenuePage id={id} form={{ ...form, lat: String(place.lat), lng: String(place.lng) }} found={place} />);
  }

  const error = await venueError(db, id, form);
  if (error) return c.html(<VenuePage id={id} form={form} error={error} />, 422);
  const [lat, lng] = form.lat ? [Number(form.lat), Number(form.lng)] : [null, null];
  await db.prepare("UPDATE venue SET name = ?, address = ?, lat = ?, lng = ? WHERE id = ?").bind(form.name, form.address || null, lat, lng, id).run();
  return c.redirect(`/admin/venues/${id}?saved=1`, 303);
});

async function venueError(db: D1Database, id: number, form: VenueForm): Promise<string | null> {
  if (!form.name) return "Bitte einen Namen eintragen.";
  // Venues are matched by name (publish.ts `findVenue`), so a new name can't be another Venue's.
  const { results } = await db.prepare("SELECT id, name FROM venue").all<{ id: number; name: string }>();
  const renamed = normalize(results.find((v) => v.id === id)!.name) !== normalize(form.name);
  if (renamed && results.some((v) => v.id !== id && normalize(v.name) === normalize(form.name))) return `Einen Ort „${form.name}“ gibt es schon.`;
  if (!form.lat && !form.lng) return null;
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (!form.lat || !form.lng || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return "Breite und Länge als Zahlen eintragen (z. B. 51.31 und 9.49), oder beide leer lassen.";
  }
  return null;
}

function VenuePage(props: { id: number; form: VenueForm; found?: Place; error?: string; saved?: boolean }) {
  const f = props.form;
  return (
    <Layout title={`${f.name || "Ort"} – DanceCalendar Admin`}>
      <p>
        <a href="/admin/venues">← Orte</a>
      </p>
      <h1>Ort korrigieren</h1>
      <p>Organizer können einen bekannten Ort nicht ändern; Events finden ihren Ort über den Namen.</p>
      {props.saved && <p>✅ Gespeichert.</p>}
      {props.error && <p style="color:#a30000">{props.error}</p>}
      {props.found && <p>Gefunden: {props.found.label}. Prüfen und speichern.</p>}
      <form method="post">
        <p>
          <label>
            Name
            <br />
            <input name="name" value={f.name} required maxlength={120} style="width:100%" />
          </label>
        </p>
        <p>
          <label>
            Adresse
            <br />
            <input name="address" value={f.address} maxlength={200} style="width:100%" />
          </label>
        </p>
        <p>
          <label>
            Breite <input name="lat" value={f.lat} inputmode="decimal" size={10} />
          </label>{" "}
          <label>
            Länge <input name="lng" value={f.lng} inputmode="decimal" size={10} />
          </label>
        </p>
        {f.lat && f.lng && (
          <p>
            <a href={`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=17/${f.lat}/${f.lng}`} target="_blank" rel="noopener">
              Auf der Karte ansehen
            </a>
          </p>
        )}
        <button type="submit" name="action" value="save">
          Speichern
        </button>{" "}
        <button type="submit" name="action" value="geocode" formnovalidate>
          Adresse suchen
        </button>
      </form>
    </Layout>
  );
}

function Back() {
  return (
    <p>
      <a href="/admin">← Admin</a>
    </p>
  );
}
