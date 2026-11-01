import { Hono } from "hono";
import { AlreadyDone, ConfirmPage, Done, flyerOf, loadSubmission, openCards, readCards } from "./confirm-page";
import type { Extraction } from "./extraction/extract";
import { Layout } from "./layout";
import { publishSubmission, randomToken } from "./publish";
import { ruleWords, type Rule } from "./series";
import { sendText } from "./whatsapp/graph";
import { formatDate } from "./whatsapp/summary";

// Tips: a Flyer from someone who isn't its Organizer ("Nein, ist ein Tipp", remembered per number).
// It's read and held without an Organizer for the Admin's review at /admin/tips, in the confirm-page
// cards: [Freigeben] publishes its Events marked "von der Community hinzugefügt" under a name from the
// Flyer, [Ablehnen] deletes it at once. The tipper gets no news either way. Tip data goes within 30 days.
// Decisions: .scratch/dance-calendar-mvp/issues/11-admin-view.md, 08-organizer-confirmation-flow.md

export const TIP_THANKS = "Danke für den Tipp! 🙏 Der Admin schaut ihn sich an und trägt ihn ein.";

const KEPT = "-30 days"; // the legal ticket's retention limit for Tip data

// Holds a read Flyer as a Tip and thanks the sender.
export async function holdTip(env: Env, to: string, held: { id: string; flyerKey: string; receivedOn: string }, extraction: Extraction) {
  await env.DB.prepare("UPDATE contact SET tip_at = datetime('now') WHERE whatsapp_number = ?").bind(to).run();
  if (!extraction.is_event_flyer || extraction.events.length === 0) {
    await env.FLYERS.delete(held.flyerKey);
    return sendText(env, to, "Ich konnte auf dem Bild keine Tanzveranstaltung erkennen. Schick mir gern einen anderen Flyer.");
  }
  await env.DB.prepare(
    "INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, confirm_token, source) VALUES (?, NULL, ?, ?, ?, ?, 'tip')",
  )
    .bind(held.id, held.flyerKey, held.receivedOn, JSON.stringify(extraction), randomToken())
    .run();
  return sendText(env, to, TIP_THANKS);
}

// Cron: Tips the Admin hasn't reviewed in 30 days go with their Flyer, and a number is asked again
// whether it's their Event 30 days after its last Tip.
export async function cleanUpTips(env: Env) {
  const { results } = await env.DB.prepare(
    `DELETE FROM submission WHERE source = 'tip' AND status = 'pending' AND created_at < datetime('now', '${KEPT}') RETURNING flyer_key`,
  ).all<{ flyer_key: string }>();
  for (const r of results) await env.FLYERS.delete(r.flyer_key);
  await env.DB.prepare(`UPDATE contact SET tip_at = NULL WHERE tip_at < datetime('now', '${KEPT}')`).run();
}

// Mounted at /admin/tips, behind the Admin's password.
export const tipReview = new Hono<{ Bindings: Env }>();

// Free-text Series rules ("Anders …") wait here too: the Admin sets a real rule on the Series page.
tipReview.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT confirm_token, received_on, extraction FROM submission WHERE source = 'tip' AND status = 'pending' ORDER BY created_at",
  ).all<{ confirm_token: string; received_on: string; extraction: string }>();
  const { results: rules } = await c.env.DB.prepare(
    `SELECT json_extract(template, '$.title') AS title, rule, edit_token FROM series
     WHERE ended_at IS NULL AND json_extract(rule, '$.freq') = 'custom' ORDER BY created_at`,
  ).all<{ title: string; rule: string; edit_token: string }>();
  return c.html(
    <Layout title="Tipps – DanceCalendar">
      <p>
        <a href="/admin">← Admin</a>
      </p>
      <h1>Tipps</h1>
      {results.length === 0 ? (
        <p>Keine Tipps zu prüfen.</p>
      ) : (
        <ul style="list-style:none; padding:0">
          {results.map((t) => {
            const events = (JSON.parse(t.extraction) as Extraction).events;
            const first = events[0];
            return (
              <li style="display:flex; gap:.75rem; align-items:center; margin-bottom:1rem">
                <img src={`/admin/tips/${t.confirm_token}/flyer`} alt="" width={64} style="border-radius:6px" />
                <a href={`/admin/tips/${t.confirm_token}`}>
                  <strong>{first.title || "(ohne Titel)"}</strong>
                  {first.start_date ? ` – ${formatDate(first.start_date, t.received_on)}` : ""}
                  {events.length > 1 ? ` (+${events.length - 1} weitere)` : ""}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <h2>Freie Wiederholungen</h2>
      {rules.length === 0 ? (
        <p>Keine Regeln zu prüfen.</p>
      ) : (
        <ul>
          {rules.map((r) => (
            <li>
              <a href={`/s/${r.edit_token}`}>
                <strong>{r.title}</strong>
              </a>
              : {ruleWords(JSON.parse(r.rule) as Rule)}
              <br />
              <small>Auf der Serienseite eine Wiederholung wählen oder die Serie beenden.</small>
            </li>
          ))}
        </ul>
      )}
    </Layout>,
  );
});

tipReview.get("/:token", async (c) => {
  const s = await loadTip(c.env.DB, c.req.param("token"));
  if (!s) return c.notFound();
  if (s.status !== "pending") return c.html(<AlreadyDone />);
  const shownAs = (JSON.parse(s.extraction) as Extraction).display_name_on_flyer;
  return c.html(<ConfirmPage {...await openCards(c.env, s)} tip={{ shownAs }} />);
});

tipReview.get("/:token/flyer", async (c) => {
  const s = await loadTip(c.env.DB, c.req.param("token"));
  return s ? flyerOf(c.env, s) : c.notFound();
});

tipReview.post("/:token", async (c) => {
  const s = await loadTip(c.env.DB, c.req.param("token"));
  if (!s) return c.notFound();
  if (s.status !== "pending") return c.html(<AlreadyDone />, 409);

  const form = await c.req.formData();
  const shownAs = String(form.get("shown_as") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const read = await readCards(c.env, s, form);
  if (read.blocked || !shownAs) {
    const page = read.blocked ? read.page : await read.page();
    const error = shownAs ? undefined : "Bitte einen Namen eintragen, unter dem der Tipp gezeigt wird.";
    return c.html(<ConfirmPage {...page} tip={{ shownAs, error }} />, 422);
  }
  const result = await publishSubmission(c.env, s, read.ready, read.skipped, shownAs);
  if (!result) return c.html(<AlreadyDone />, 409);
  return c.html(<Done s={s} entries={result.entries} skipped={read.skipped} />);
});

tipReview.post("/:token/reject", async (c) => {
  const row = await c.env.DB.prepare("DELETE FROM submission WHERE confirm_token = ? AND source = 'tip' AND status = 'pending' RETURNING flyer_key")
    .bind(c.req.param("token"))
    .first<{ flyer_key: string }>();
  if (row) await c.env.FLYERS.delete(row.flyer_key);
  return c.redirect("/admin/tips", 303);
});

async function loadTip(db: D1Database, token: string) {
  const s = await loadSubmission(db, token);
  return s?.source === "tip" ? s : null;
}
