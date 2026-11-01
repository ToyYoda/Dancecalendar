import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { extractFlyer } from "./extraction/extract";
import { Layout } from "./layout";
import { randomToken } from "./publish";
import { berlinDate } from "./whatsapp/bot";

// /admin, behind a password (the ADMIN_SECRET Worker secret) until Cloudflare Access comes with Deploy.
// /admin/upload seeds the calendar: the Flyer goes through the same queue and extraction as a WhatsApp
// Flyer, into the same confirm page, and is published under the chosen Organizer.

export type AdminUpload = {
  type: "admin_upload";
  token: string; // the confirm page's token, known before the extraction is done
  flyerKey: string;
  mimeType: string;
  organizerId: number;
  receivedOn: string;
};

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const admin = new Hono<{ Bindings: Env }>();

admin.use("*", async (c, next) => {
  if (!c.env.ADMIN_SECRET) return c.text("Admin ist noch nicht eingerichtet.", 503);
  return basicAuth({ username: "admin", password: c.env.ADMIN_SECRET, realm: "DanceCalendar Admin" })(c, next);
});

admin.get("/upload", async (c) => c.html(<UploadForm organizers={await organizers(c.env.DB)} />));

admin.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body.flyer;
  const organizer = (await organizers(c.env.DB)).find((o) => String(o.id) === body.organizer_id);
  if (!(file instanceof File) || !IMAGE_TYPES[file.type] || !organizer) {
    return c.html(<UploadForm organizers={await organizers(c.env.DB)} error="Bitte ein Bild (JPEG, PNG, WebP) und einen Organizer wählen." />, 400);
  }

  const token = randomToken();
  const flyerKey = `flyers/${randomToken()}.${IMAGE_TYPES[file.type]}`;
  await c.env.FLYERS.put(flyerKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const job: AdminUpload = {
    type: "admin_upload",
    token,
    flyerKey,
    mimeType: file.type,
    organizerId: organizer.id,
    receivedOn: berlinDate(new Date()),
  };
  await c.env.JOBS.send(job);
  return c.redirect(`/admin/upload/${token}`, 303);
});

// Waits for the queue consumer, then hands over to the confirm page.
admin.get("/upload/:token", async (c) => {
  const token = c.req.param("token");
  const s = await c.env.DB.prepare("SELECT status, extraction FROM submission WHERE confirm_token = ? AND source = 'admin'")
    .bind(token)
    .first<{ status: string; extraction: string }>();
  const error = s && (JSON.parse(s.extraction) as { error?: string }).error;
  if (error) {
    return c.html(
      <Layout title="Fehler – DanceCalendar">
        <h1>Auslesen fehlgeschlagen</h1>
        <p>Der Flyer konnte nicht ausgelesen werden:</p>
        <pre style="white-space: pre-wrap">{error}</pre>
        <p>
          <a href="/admin/upload">Nochmal hochladen</a>
        </p>
      </Layout>,
    );
  }
  if (s?.status === "discarded") {
    return c.html(
      <Layout title="Kein Flyer – DanceCalendar">
        <h1>Keine Tanzveranstaltung erkannt</h1>
        <p>Auf dem Bild habe ich keine Tanzveranstaltung erkannt.</p>
        <p>
          <a href="/admin/upload">Anderen Flyer hochladen</a>
        </p>
      </Layout>,
    );
  }
  if (s) return c.redirect(`/c/${token}`, 303);
  return c.html(
    <Layout title="Wird ausgelesen – DanceCalendar" head={<meta http-equiv="refresh" content="2" />}>
      <h1>Flyer wird ausgelesen …</h1>
      <p>Das dauert meist ein paar Sekunden. Dauert es länger als eine Minute, lade den Flyer nochmal hoch.</p>
    </Layout>,
  );
});

// Queue consumer for an upload: same extraction as a WhatsApp Flyer, held for the confirm page.
export async function readUpload(env: Env, job: AdminUpload) {
  const object = await env.FLYERS.get(job.flyerKey);
  if (!object) return;
  const extraction = await extractFlyer(env.ANTHROPIC_API_KEY, await object.arrayBuffer(), job.mimeType, job.receivedOn);
  const found = extraction.is_event_flyer && extraction.events.length > 0;
  if (!found) await env.FLYERS.delete(job.flyerKey);
  await env.DB.prepare(
    `INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, status, confirm_token, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'admin')`,
  )
    .bind(randomToken(), job.organizerId, job.flyerKey, job.receivedOn, JSON.stringify(extraction), found ? "pending" : "discarded", job.token)
    .run();
}

// After the last try, the waiting page shows the error instead of waiting forever.
export async function uploadFailed(env: Env, job: AdminUpload, err: unknown) {
  await env.FLYERS.delete(job.flyerKey);
  await env.DB.prepare(
    `INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, status, confirm_token, source)
     VALUES (?, ?, ?, ?, ?, 'discarded', ?, 'admin')`,
  )
    .bind(randomToken(), job.organizerId, job.flyerKey, job.receivedOn, JSON.stringify({ error: String(err) }), job.token)
    .run();
}

async function organizers(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, display_name FROM organizer WHERE blocked_at IS NULL ORDER BY display_name")
    .all<{ id: number; display_name: string }>();
  return results;
}

function UploadForm(props: { organizers: { id: number; display_name: string }[]; error?: string }) {
  return (
    <Layout title="Flyer hochladen – DanceCalendar">
      <h1>Flyer hochladen</h1>
      {props.error && <p style="color:#a30000">{props.error}</p>}
      {props.organizers.length === 0 ? (
        <p>Es gibt noch keine Organizer, unter denen veröffentlicht werden kann.</p>
      ) : (
        <form method="post" enctype="multipart/form-data">
          <p>
            <label>
              Flyer (Bild)
              <br />
              <input type="file" name="flyer" accept="image/jpeg,image/png,image/webp" required />
            </label>
          </p>
          <p>
            <label>
              Veröffentlichen als
              <br />
              <select name="organizer_id" required>
                {props.organizers.map((o) => (
                  <option value={String(o.id)}>{o.display_name}</option>
                ))}
              </select>
            </label>
          </p>
          <button type="submit">Hochladen und auslesen</button>
        </form>
      )}
    </Layout>
  );
}
