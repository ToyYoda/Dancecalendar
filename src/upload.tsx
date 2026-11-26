import type { Context } from "hono";
import { extractFlyer } from "./extraction/extract";
import { randomToken } from "./publish";
import { SitePage } from "./site";
import { berlinDate } from "./whatsapp/bot";

// A Flyer uploaded on the web, by the Admin at /admin/upload or by an Organizer from an edit page or the
// Organizer area (/veranstalter): it goes through the same queue and extraction as a messenger Flyer,
// into the same confirm page, and is published under the given Organizer. A Tip from the Organizer area
// ("source: tip", no Organizer) goes to the Admin's review instead. Nobody gets a chat reply.

export type FlyerUpload = {
  type: "flyer_upload";
  source: "admin" | "web" | "tip";
  token: string; // the confirm page's token, known before the extraction is done
  flyerKey: string;
  mimeType: string;
  organizerId: number | null; // null for a Tip
  receivedOn: string;
};

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Stores the Flyer and queues its extraction. Returns the confirm page's token, or null if `file` is no image.
export async function queueUpload(env: Env, file: unknown, organizerId: number | null, source: FlyerUpload["source"]): Promise<string | null> {
  if (!(file instanceof File) || !IMAGE_TYPES[file.type]) return null;
  const token = randomToken();
  const flyerKey = `flyers/${randomToken()}.${IMAGE_TYPES[file.type]}`;
  await env.FLYERS.put(flyerKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const job: FlyerUpload = { type: "flyer_upload", source, token, flyerKey, mimeType: file.type, organizerId, receivedOn: berlinDate(new Date()) };
  await env.JOBS.send(job);
  return token;
}

// 15 refreshes every 2 seconds, then every 5 seconds until 35: about two minutes in all.
const FAST_TRIES = 15;
const GIVE_UP_AFTER = 35;

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
      <SitePage title="Fehler">
        <h1>Auslesen fehlgeschlagen</h1>
        <p class="note bad">Der Flyer konnte nicht ausgelesen werden. Versuch es bitte nochmal, oft klappt es beim zweiten Mal.</p>
        <details class="more">
          <summary>Technische Details</summary>
          <pre style="white-space:pre-wrap">{error}</pre>
        </details>
        <p>
          <a class="btn solid" href={again}>Nochmal hochladen</a>
        </p>
      </SitePage>,
    );
  }
  if (s?.status === "discarded") {
    return c.html(
      <SitePage title="Kein Flyer">
        <h1>Keine Tanzveranstaltung erkannt</h1>
        <p class="lead">Auf dem Bild habe ich keine Tanzveranstaltung gefunden. Am besten klappt es mit dem Flyer selbst, als Foto oder Screenshot.</p>
        <p>
          <a class="btn solid" href={again}>Anderen Flyer hochladen</a>
        </p>
      </SitePage>,
    );
  }
  if (s) return c.redirect(`/c/${token}`, 303);
  // The page counts its own refreshes in `n`, so a forgotten tab stops after about two minutes
  // instead of costing a Worker request every 2 seconds forever (ADR 0008).
  const tries = Math.max(0, Number.parseInt(c.req.query("n") ?? "", 10) || 0);
  const path = c.req.path;
  if (tries >= GIVE_UP_AFTER) {
    return c.html(
      <SitePage title="Dauert lange">
        <h1>Das dauert ungewöhnlich lange</h1>
        <p class="lead">Vielleicht wird der Flyer noch ausgelesen. Schau gleich nochmal nach, oder lade ihn nochmal hoch.</p>
        <p>
          <a class="btn solid" href={path}>Nochmal nachsehen</a> <a class="btn" href={again}>Nochmal hochladen</a>
        </p>
      </SitePage>,
    );
  }
  const seconds = tries < FAST_TRIES ? 2 : 5;
  return c.html(
    <SitePage title="Wird ausgelesen" head={<meta http-equiv="refresh" content={`${seconds}; url=${path}?n=${tries + 1}`} />}>
      <h1>Flyer wird ausgelesen …</h1>
      <div class="panel" style="display:flex;gap:14px;align-items:center">
        <span class="spin" aria-hidden="true" />
        <p>Das dauert meist ein paar Sekunden. Danach prüfst du alles, bevor es in den Kalender kommt.</p>
      </div>
      <p class="hint">Dauert es länger als eine Minute, lade den Flyer bitte nochmal hoch.</p>
    </SitePage>,
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
