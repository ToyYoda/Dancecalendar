import { Hono } from "hono";
import { sendText } from "./graph";
import type { InboundMessage } from "./types";

// Meta's webhook: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
// Answer fast and do the work in the queue consumer; Meta retries for days without a quick 200.

export const webhook = new Hono<{ Bindings: Env }>();

webhook.get("/", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  if (mode === "subscribe" && token === c.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(c.req.query("hub.challenge") ?? "");
  }
  return c.text("Forbidden", 403);
});

webhook.post("/", async (c) => {
  const body = await c.req.text();
  if (!(await validSignature(body, c.req.header("x-hub-signature-256"), c.env.WHATSAPP_APP_SECRET))) {
    return c.text("Bad signature", 401);
  }

  for (const message of inboundMessages(JSON.parse(body))) {
    // Meta may deliver the same message more than once.
    const { meta } = await c.env.DB.prepare("INSERT OR IGNORE INTO inbound_message (message_id) VALUES (?)").bind(message.id).run();
    if (meta.changes !== 1) continue;
    await replyReading(c.env, message);
    await c.env.JOBS.send(message);
  }
  return c.text("OK");
});

// Reading a Flyer takes a few seconds, and the queue adds its own delay before the bot sees the message,
// so the sender hears here, at once, that the Flyer arrived: an Organizer's or a remembered Tip number's
// Flyer, or a tap on "Nein, ist ein Tipp". An unknown sender's Flyer gets "Ist das deine Veranstaltung?"
// from the queue instead. A failed reply only loses the reply, never the Flyer.
async function replyReading(env: Env, message: InboundMessage) {
  const flyer = message.type === "image";
  const tipTap = message.interactive?.button_reply?.id.startsWith("tip:") ?? false;
  if (!flyer && !tipTap) return;
  const who = await env.DB.prepare(
    `SELECT o.id AS organizer, o.blocked_at, c.tip_at, c.opted_out_at
     FROM (SELECT ? AS n) LEFT JOIN organizer o ON o.whatsapp_number = n LEFT JOIN contact c ON c.whatsapp_number = n`,
  )
    .bind(message.from)
    .first<{ organizer: number | null; blocked_at: string | null; tip_at: string | null; opted_out_at: string | null }>();
  if (!who || who.opted_out_at || who.blocked_at) return;
  if (flyer && !who.organizer && !who.tip_at) return;
  try {
    await sendText(env, message.from, "Danke! Ich lese deinen Flyer – in ein paar Sekunden melde ich mich.");
  } catch (err) {
    console.error("reading reply failed", err);
  }
}

function inboundMessages(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      // Delivery/read statuses arrive in the same field without `messages`; they are ignored.
      for (const m of change.value?.messages ?? []) out.push(m);
    }
  }
  return out;
}

async function validSignature(body: string, header: string | undefined, secret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const given = hexToBytes(header.slice("sha256=".length));
  if (!given) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, given, new TextEncoder().encode(body));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}
