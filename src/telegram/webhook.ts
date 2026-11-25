import { Hono } from "hono";
import { replyReading } from "../whatsapp/webhook";
import type { InboundMessage } from "../whatsapp/types";
import { handleTelegramLogin } from "../web-login";
import { answerCallback, webhookSecret } from "./api";

// Telegram's webhook: https://core.telegram.org/bots/api#setwebhook
// Every update becomes the same InboundMessage the WhatsApp webhook queues, with "tg:" addresses,
// so the bot behind the queue doesn't know which messenger it answers. Only private chats count.

export const telegramWebhook = new Hono<{ Bindings: Env }>();

telegramWebhook.post("/", async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.text("Telegram is not set up", 503);
  if (!(await same(c.req.header("x-telegram-bot-api-secret-token") ?? "", await webhookSecret(c.env)))) return c.text("Forbidden", 403);

  const update = await c.req.json<any>().catch(() => null);
  if (update?.callback_query?.id) {
    await answerCallback(c.env, update.callback_query.id).catch((err) => console.error("Telegram answerCallbackQuery failed", err));
  }
  // Logging in on the website (src/web-login.ts) is answered here, outside the bot's conversation.
  if (await handleTelegramLogin(c.env, update)) return c.text("OK");
  const message = inboundMessage(update);
  if (!message) return c.text("OK");

  // Telegram retries an update until it gets a 200.
  const { meta } = await c.env.DB.prepare("INSERT OR IGNORE INTO inbound_message (message_id) VALUES (?)").bind(message.id).run();
  if (meta.changes !== 1) return c.text("OK");
  await replyReading(c.env, message);
  await c.env.JOBS.send(message);
  return c.text("OK");
});

const COMMAND = /^\/(start|stop|admin)(@\w+)?(\s.*)?$/i;
const IMAGE_FILES = ["image/jpeg", "image/png", "image/webp"];

export function inboundMessage(update: any): InboundMessage | null {
  const id = `tg:${update?.update_id}`;
  const cq = update?.callback_query;
  if (cq) {
    if (cq.message && cq.message.chat?.type !== "private") return null;
    if (typeof cq.data !== "string") return null;
    const timestamp = String(Math.floor(Date.now() / 1000));
    return { id, from: `tg:${cq.from.id}`, timestamp, type: "interactive", interactive: { type: "button_reply", button_reply: { id: cq.data, title: "" } } };
  }

  const m = update?.message;
  if (!m || m.chat?.type !== "private") return null;
  const base = { id, from: `tg:${m.chat.id}`, timestamp: String(m.date) };
  if (typeof m.text === "string") {
    // "/start", "/stop" and "/admin" from the command menu are the bot's START, STOP and ADMIN.
    const command = m.text.trim().match(COMMAND);
    return { ...base, type: "text", text: { body: command ? command[1].toUpperCase() : m.text } };
  }
  if (Array.isArray(m.photo) && m.photo.length) {
    const largest = m.photo[m.photo.length - 1]; // sizes come smallest first
    return { ...base, type: "image", image: { id: `tg:${largest.file_id}`, mime_type: "image/jpeg" } };
  }
  // A Flyer sent "as a file" keeps its full resolution.
  if (m.document && IMAGE_FILES.includes(m.document.mime_type)) {
    return { ...base, type: "image", image: { id: `tg:${m.document.file_id}`, mime_type: m.document.mime_type } };
  }
  return { ...base, type: m.document ? "document" : "other" };
}

async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = [new TextEncoder().encode(a), new TextEncoder().encode(b)];
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}
