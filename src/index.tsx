import { Hono } from "hono";
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
app.route("/webhook", webhook);

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<InboundMessage>, env: Env, _ctx: ExecutionContext) {
    for (const message of batch.messages) {
      await handleMessage(env, message.body);
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, InboundMessage>;
