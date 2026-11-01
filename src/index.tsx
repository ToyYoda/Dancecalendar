import { Hono } from "hono";
import { admin, readUpload, type AdminUpload } from "./admin";
import { confirmPage } from "./confirm-page";
import { EditPage, loadByEditToken } from "./edit-page";
import { DataDeletion, PrivacyPolicy } from "./legal-pages";
import { loadWeek, WeekFeed } from "./week-feed";
import { handleMessage } from "./whatsapp/bot";
import type { InboundMessage } from "./whatsapp/types";
import { webhook } from "./whatsapp/webhook";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => c.html(<WeekFeed events={await loadWeek(c.env.DB, new Date())} />));
app.get("/datenschutz", (c) => c.html(<PrivacyPolicy />));
app.get("/datenloeschung", (c) => c.html(<DataDeletion />));
app.get("/e/:token", async (c) => {
  const event = await loadByEditToken(c.env.DB, c.req.param("token"));
  return event ? c.html(<EditPage event={event} />) : c.notFound();
});
app.route("/c", confirmPage);
app.route("/admin", admin);
app.route("/webhook", webhook);

// Queue jobs: inbound WhatsApp messages from the webhook, and Admin Flyer uploads.
export type Job = InboundMessage | AdminUpload;

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<Job>, env: Env, _ctx: ExecutionContext) {
    for (const message of batch.messages) {
      const job = message.body;
      if (job.type === "admin_upload") await readUpload(env, job as AdminUpload);
      else await handleMessage(env, job as InboundMessage);
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, Job>;
