import { Hono } from "hono";
import { admin } from "./admin";
import { digestDue, EMAIL_CRON, sendDailyEmail } from "./admin-email";
import { applyPage, cleanUpApplications } from "./application";
import { confirmPage } from "./confirm-page";
import { editPage } from "./edit-page";
import { legalPages } from "./legal-pages";
import { overview } from "./overview";
import { cleanUpPast } from "./retention";
import { extendSeries } from "./series";
import { seriesPage } from "./series-page";
import { cleanUpTips } from "./tips";
import { readUpload, uploadFailed, type FlyerUpload } from "./upload";
import { berlinDate, handleMessage } from "./whatsapp/bot";
import type { InboundMessage } from "./whatsapp/types";
import { webhook } from "./whatsapp/webhook";

// Not strict: "/admin/upload/" finds the same page as "/admin/upload".
const app = new Hono<{ Bindings: Env }>({ strict: false });

app.route("/", legalPages);
app.route("/e", editPage);
app.route("/s", seriesPage);
app.route("/a", applyPage);
app.route("/c", confirmPage);
app.route("/admin", admin);
app.route("/webhook", webhook);
app.route("/", overview);

// Queue jobs: inbound WhatsApp messages from the webhook, and Flyers uploaded on the web.
export type Job = InboundMessage | FlyerUpload;

const SERIES_CRON = "30 2 * * *";
const MAX_ATTEMPTS = 3; // the first try plus max_retries in wrangler.jsonc

export default {
  fetch: app.fetch,
  // Hourly (wrangler.jsonc): held Flyers of unfinished applications go after 24 hours, Tip data after 30 days.
  // Daily: past Events and other old data go (retention.ts), then every running Series generates its Events
  // up to 12 weeks ahead; and the Admin's email at 21:00 German time.
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date(controller.scheduledTime);
    if (controller.cron === SERIES_CRON) ctx.waitUntil(cleanUpPast(env, berlinDate(now)).then(() => extendSeries(env.DB, berlinDate(now))));
    else if (controller.cron === EMAIL_CRON) ctx.waitUntil(digestDue(now) ? sendDailyEmail(env, now) : Promise.resolve());
    else ctx.waitUntil(Promise.all([cleanUpApplications(env), cleanUpTips(env)]));
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
        await handleMessage(env, job as InboundMessage, message.attempts);
      }
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, Job>;
