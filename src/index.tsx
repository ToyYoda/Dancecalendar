import { Hono } from "hono";
import { admin } from "./admin";
import { applyPage, cleanUpApplications } from "./application";
import { confirmPage } from "./confirm-page";
import { editPage } from "./edit-page";
import { DataDeletion, PrivacyPolicy } from "./legal-pages";
import { readUpload, uploadFailed, type FlyerUpload } from "./upload";
import { loadWeek, WeekFeed } from "./week-feed";
import { handleMessage } from "./whatsapp/bot";
import type { InboundMessage } from "./whatsapp/types";
import { webhook } from "./whatsapp/webhook";

// Not strict: "/admin/upload/" finds the same page as "/admin/upload".
const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => c.html(<WeekFeed events={await loadWeek(c.env.DB, new Date())} />));
app.get("/datenschutz", (c) => c.html(<PrivacyPolicy />));
app.get("/datenloeschung", (c) => c.html(<DataDeletion />));
app.route("/e", editPage);
app.route("/a", applyPage);
app.route("/c", confirmPage);
app.route("/admin", admin);
app.route("/webhook", webhook);

// Queue jobs: inbound WhatsApp messages from the webhook, and Flyers uploaded on the web.
export type Job = InboundMessage | FlyerUpload;

const MAX_ATTEMPTS = 3; // the first try plus max_retries in wrangler.jsonc

export default {
  fetch: app.fetch,
  // Hourly (wrangler.jsonc): held Flyers of unfinished applications go after 24 hours.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanUpApplications(env));
  },
  async queue(batch: MessageBatch<Job>, env: Env, _ctx: ExecutionContext) {
    for (const message of batch.messages) {
      const job = message.body;
      if (job.type === "flyer_upload") {
        try {
          await readUpload(env, job as FlyerUpload);
        } catch (err) {
          console.error("flyer upload failed", message.attempts, err);
          if (message.attempts < MAX_ATTEMPTS) {
            message.retry();
            continue;
          }
          await uploadFailed(env, job as FlyerUpload, err);
        }
      } else {
        await handleMessage(env, job as InboundMessage);
      }
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, Job>;
