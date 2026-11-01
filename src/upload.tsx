import type { Context } from "hono";
import { extractFlyer } from "./extraction/extract";
import { Layout } from "./layout";
import { randomToken } from "./publish";
import { berlinDate } from "./whatsapp/bot";

// A Flyer uploaded on the web, by the Admin at /admin/upload or by an Organizer from an edit page:
// it goes through the same queue and extraction as a WhatsApp Flyer, into the same confirm page, and
// is published under the given Organizer. Nobody gets a WhatsApp reply.

export type FlyerUpload = {
  type: "flyer_upload";
  source: "admin" | "web";
  token: string; // the confirm page's token, known before the extraction is done
  flyerKey: string;
  mimeType: string;
  organizerId: number;
  receivedOn: string;
};

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Stores the Flyer and queues its extraction. Returns the confirm page's token, or null if `file` is no image.
export async function queueUpload(env: Env, file: unknown, organizerId: number, source: FlyerUpload["source"]): Promise<string | null> {
  if (!(file instanceof File) || !IMAGE_TYPES[file.type]) return null;
  const token = randomToken();
  const flyerKey = `flyers/${randomToken()}.${IMAGE_TYPES[file.type]}`;
  await env.FLYERS.put(flyerKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const job: FlyerUpload = { type: "flyer_upload", source, token, flyerKey, mimeType: file.type, organizerId, receivedOn: berlinDate(new Date()) };
  await env.JOBS.send(job);
  return token;
}

// The waiting page: refreshes until the queue consumer is done, then hands over to the confirm page.
// `again` is where to upload another Flyer.
export async function waitForUpload(c: Context<{ Bindings: Env }>, token: string, organizerId: number | null, again: string) {
  const s = await c.env.DB.prepare(
    "SELECT status, extraction FROM submission WHERE confirm_token = ? AND source != 'whatsapp' AND (? IS NULL OR organizer_id = ?)",
  )
    .bind(token, organizerId, organizerId)
    .first<{ status: string; extraction: string }>();
  const error = s && (JSON.parse(s.extraction) as { error?: string }).error;
  if (error) {
    return c.html(
      <Layout title="Fehler – DanceCalendar">
        <h1>Auslesen fehlgeschlagen</h1>
        <p>Der Flyer konnte nicht ausgelesen werden:</p>
        <pre style="white-space: pre-wrap">{error}</pre>
        <p>
          <a href={again}>Nochmal hochladen</a>
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
          <a href={again}>Anderen Flyer hochladen</a>
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
}

// Queue consumer for an upload: same extraction as a WhatsApp Flyer, held for the confirm page.
export async function readUpload(env: Env, job: FlyerUpload) {
  const object = await env.FLYERS.get(job.flyerKey);
  if (!object) return;
  const extraction = await extractFlyer(env.ANTHROPIC_API_KEY, await object.arrayBuffer(), job.mimeType, job.receivedOn);
  const found = extraction.is_event_flyer && extraction.events.length > 0;
  if (!found) await env.FLYERS.delete(job.flyerKey);
  await hold(env, job, JSON.stringify(extraction), found ? "pending" : "discarded");
}

// After the last try, the waiting page shows the error instead of waiting forever.
export async function uploadFailed(env: Env, job: FlyerUpload, err: unknown) {
  await env.FLYERS.delete(job.flyerKey);
  await hold(env, job, JSON.stringify({ error: String(err) }), "discarded");
}

async function hold(env: Env, job: FlyerUpload, extraction: string, status: string) {
  await env.DB.prepare(
    `INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, status, confirm_token, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(randomToken(), job.organizerId, job.flyerKey, job.receivedOn, extraction, status, job.token, job.source)
    .run();
}
