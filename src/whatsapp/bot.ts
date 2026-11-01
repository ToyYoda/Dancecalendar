import { answerOwnership, askOwnership } from "../application";
import { holdTip } from "../tips";
import { extractFlyer, type Extraction } from "../extraction/extract";
import { answerButton, answerTyped, continueFlyer } from "./questions";
import { publishable } from "./summary";
import { downloadMedia, sendButtons, sendText } from "./graph";
import { publishSubmission, randomToken } from "../publish";
import type { InboundMessage } from "./types";

// Handles one inbound WhatsApp message (queue consumer). The bot only ever replies, so every
// message stays inside WhatsApp's free 24-hour service window.

export type Organizer = { id: number; first_name: string | null };

// `attempt` is the queue's delivery count: one-off replies go out on the first attempt only, so a retry doesn't repeat them.
export async function handleMessage(env: Env, message: InboundMessage, attempt = 1) {
  const from = message.from;
  const command = message.type === "text" ? message.text!.body.trim().toUpperCase() : "";
  const contact = await env.DB.prepare("SELECT greeted_at, opted_out_at, tip_at FROM contact WHERE whatsapp_number = ?")
    .bind(from)
    .first<{ greeted_at: string | null; opted_out_at: string | null; tip_at: string | null }>();

  if (command === "STOP") {
    await env.DB.prepare(
      `INSERT INTO contact (whatsapp_number, opted_out_at) VALUES (?, datetime('now'))
       ON CONFLICT (whatsapp_number) DO UPDATE SET opted_out_at = datetime('now')`,
    )
      .bind(from)
      .run();
    return sendText(env, from, "Du bekommst keine Nachrichten mehr von mir. Mit START meldest du dich wieder an.");
  }
  if (contact?.opted_out_at && command !== "START") return;

  if (!contact?.greeted_at || command === "START") {
    await env.DB.prepare(
      `INSERT INTO contact (whatsapp_number, greeted_at) VALUES (?, datetime('now'))
       ON CONFLICT (whatsapp_number) DO UPDATE SET greeted_at = datetime('now'), opted_out_at = NULL`,
    )
      .bind(from)
      .run();
    await sendText(env, from, greeting(env));
    if (command === "START") return;
  }

  if (command === "ADMIN") {
    await env.DB.prepare("INSERT INTO admin_request (whatsapp_number) VALUES (?)").bind(from).run();
    return sendText(env, from, "Ich gebe dem Admin Bescheid – er meldet sich bei dir.");
  }

  const organizer = await env.DB.prepare("SELECT id, first_name, blocked_at FROM organizer WHERE whatsapp_number = ?")
    .bind(from)
    .first<Organizer & { blocked_at: string | null }>();
  if (organizer?.blocked_at) return sendText(env, from, "Du kannst hier keine Events mehr eintragen.");

  // "Ja, meine" / "Nein, ist ein Tipp" may come back after the sender became an Organizer (a retry).
  const buttonId = message.interactive?.button_reply?.id ?? "";
  if (/^(mine|tip):/.test(buttonId)) return answerOwnership(env, from, buttonId, attempt);
  if (!organizer) {
    if (message.type !== "image") return sendText(env, from, "Schick mir einfach einen Flyer als Bild, dann trage ich die Veranstaltung ein.");
    if (contact?.tip_at) return receiveTip(env, message, attempt);
    return askOwnership(env, message);
  }

  if (message.type === "image") return receiveFlyer(env, message, organizer, attempt);
  if (buttonId.startsWith("q|")) return answerButton(env, from, organizer.id, buttonId);
  if (buttonId) return pressButton(env, from, organizer, buttonId);
  if (message.type === "text" && (await answerTyped(env, from, organizer.id, message.text!.body))) return;
  if (message.type === "text") return sendText(env, from, "Schick mir einfach einen Flyer als Bild, dann trage ich die Veranstaltung ein.");
  return sendText(env, from, "Bitte schick den Flyer als Bild (Foto oder Screenshot).");
}

function greeting(env: Env): string {
  return (
    "Hallo! 👋 Ich bin der DanceCalendar-Bot. Ich lese Flyer mit KI aus – bitte prüf, was ich erkenne.\n" +
    `Datenschutz: ${env.PUBLIC_URL}/datenschutz\n` +
    `Regeln: ${env.PUBLIC_URL}/nutzungsbedingungen\n` +
    `Mensch erreichen: „Admin" schreiben · Abmelden: STOP`
  );
}

// Reading a Flyer takes a few seconds, so the sender hears at once that it arrived.
export async function acknowledgeFlyer(env: Env, to: string, attempt: number) {
  if (attempt === 1) await sendText(env, to, "Danke! Ich lese deinen Flyer – in ein paar Sekunden melde ich mich.");
}

async function receiveFlyer(env: Env, message: InboundMessage, organizer: Organizer, attempt: number) {
  await acknowledgeFlyer(env, message.from, attempt);
  const held = await storeFlyer(env, message);
  const extraction = await extractFlyer(env.ANTHROPIC_API_KEY, held.bytes, held.mimeType, held.receivedOn);
  return offerFlyer(env, message.from, organizer, held, extraction);
}

// A number that answered "Nein, ist ein Tipp" before: its Flyers are Tips without asking.
async function receiveTip(env: Env, message: InboundMessage, attempt: number) {
  await acknowledgeFlyer(env, message.from, attempt);
  const held = await storeFlyer(env, message);
  const extraction = await extractFlyer(env.ANTHROPIC_API_KEY, held.bytes, held.mimeType, held.receivedOn);
  return holdTip(env, message.from, held, extraction);
}

// Media URLs expire after 5 minutes, so every Flyer goes to R2 as soon as it arrives.
export async function storeFlyer(env: Env, message: InboundMessage) {
  const receivedOn = berlinDate(new Date(Number(message.timestamp) * 1000));
  const { bytes, mimeType } = await downloadMedia(env, message.image!.id);
  const id = randomToken();
  const flyerKey = `flyers/${id}.${mimeType === "image/png" ? "png" : "jpg"}`;
  await env.FLYERS.put(flyerKey, bytes, { httpMetadata: { contentType: mimeType } });
  return { id, flyerKey, receivedOn, bytes, mimeType };
}

// Holds a read Flyer as a submission and sends its summary with the buttons; also the way a new
// Organizer's Flyer continues after the application form.
export async function offerFlyer(
  env: Env,
  to: string,
  organizer: Organizer,
  held: { id: string; flyerKey: string; receivedOn: string },
  extraction: Extraction,
) {
  const { id, flyerKey, receivedOn } = held;
  if (!extraction.is_event_flyer || extraction.events.length === 0) {
    await env.FLYERS.delete(flyerKey);
    return sendText(env, to, "Ich konnte auf dem Bild keine Tanzveranstaltung erkennen. Schick mir gern einen anderen Flyer.");
  }

  await env.DB.prepare("INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction) VALUES (?, ?, ?, ?, ?)")
    .bind(id, organizer.id, flyerKey, receivedOn, JSON.stringify(extraction))
    .run();
  return continueFlyer(env, to, id);
}

async function pressButton(env: Env, from: string, organizer: Organizer, buttonId: string) {
  const [action, id] = buttonId.split(":");
  const submission = await env.DB.prepare(
    "SELECT id, organizer_id, flyer_key, received_on, extraction FROM submission WHERE id = ? AND organizer_id = ? AND status = 'pending'",
  )
    .bind(id, organizer.id)
    .first<{ id: string; organizer_id: number; flyer_key: string; received_on: string; extraction: string }>();
  if (!submission) return sendText(env, from, "Dieser Flyer ist schon erledigt.");

  if (action === "discard") {
    await env.DB.prepare("UPDATE submission SET status = 'discarded' WHERE id = ?").bind(id).run();
    await env.FLYERS.delete(submission.flyer_key);
    return sendText(env, from, "Verworfen.");
  }
  if (action === "edit") {
    // A URL can't share a message with reply buttons, so the confirm page's link comes on its own.
    const row = await env.DB.prepare("UPDATE submission SET confirm_token = COALESCE(confirm_token, ?) WHERE id = ? RETURNING confirm_token")
      .bind(randomToken(), id)
      .first<{ confirm_token: string }>();
    return sendText(
      env,
      from,
      `Hier kannst du alles prüfen, ändern und veröffentlichen:\n${env.PUBLIC_URL}/c/${row!.confirm_token}\n\nDer Link ist privat – nicht weiterleiten.`,
    );
  }
  if (action === "publish") {
    const events = (JSON.parse(submission.extraction) as Extraction).events.filter((e) => !e.dropped);
    const ready = events.filter((e) => publishable(e, submission.received_on));
    const skipped = events.filter((e) => !publishable(e, submission.received_on));
    const result = await publishSubmission(env, submission, ready, skipped);
    return sendText(env, from, result ? result.text : "Dieser Flyer ist schon erledigt.");
  }
}

export function berlinDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}
