import { extractFlyer, type Extraction } from "../extraction/extract";
import { formatDate, publishable, summary } from "./summary";
import { downloadMedia, sendButtons, sendText } from "./graph";
import { publishEvents, randomToken } from "../publish";
import type { InboundMessage } from "./types";

// Handles one inbound WhatsApp message (queue consumer). The bot only ever replies, so every
// message stays inside WhatsApp's free 24-hour service window.

type Organizer = { id: number; first_name: string | null };

export async function handleMessage(env: Env, message: InboundMessage) {
  const from = message.from;
  const command = message.type === "text" ? message.text!.body.trim().toUpperCase() : "";
  const contact = await env.DB.prepare("SELECT greeted_at, opted_out_at FROM contact WHERE whatsapp_number = ?")
    .bind(from)
    .first<{ greeted_at: string | null; opted_out_at: string | null }>();

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

  const organizer = await env.DB.prepare("SELECT id, first_name FROM organizer WHERE whatsapp_number = ? AND blocked_at IS NULL")
    .bind(from)
    .first<Organizer>();
  if (!organizer) {
    return sendText(env, from, "Hier können bald alle Veranstalter*innen Flyer eintragen – im Moment nur eingeladene.");
  }

  if (message.type === "image") return receiveFlyer(env, message, organizer);
  if (message.type === "interactive" && message.interactive?.button_reply) {
    return pressButton(env, from, organizer, message.interactive.button_reply.id);
  }
  if (message.type === "text") return sendText(env, from, "Schick mir einfach einen Flyer als Bild, dann trage ich die Veranstaltung ein.");
  return sendText(env, from, "Bitte schick den Flyer als Bild (Foto oder Screenshot).");
}

function greeting(env: Env): string {
  return (
    "Hallo! 👋 Ich bin der DanceCalendar-Bot. Ich lese Flyer mit KI aus – bitte prüf, was ich erkenne.\n" +
    `Datenschutz: ${env.PUBLIC_URL}/datenschutz · Mensch erreichen: „Admin" schreiben · Abmelden: STOP`
  );
}

async function receiveFlyer(env: Env, message: InboundMessage, organizer: Organizer) {
  const receivedOn = berlinDate(new Date(Number(message.timestamp) * 1000));
  const { bytes, mimeType } = await downloadMedia(env, message.image!.id);
  const id = randomToken();
  const flyerKey = `flyers/${id}.${mimeType === "image/png" ? "png" : "jpg"}`;
  await env.FLYERS.put(flyerKey, bytes, { httpMetadata: { contentType: mimeType } });

  const extraction = await extractFlyer(env.ANTHROPIC_API_KEY, bytes, mimeType, receivedOn);
  if (!extraction.is_event_flyer || extraction.events.length === 0) {
    await env.FLYERS.delete(flyerKey);
    return sendText(env, message.from, "Ich konnte auf dem Bild keine Tanzveranstaltung erkennen. Schick mir gern einen anderen Flyer.");
  }

  await env.DB.prepare("INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction) VALUES (?, ?, ?, ?, ?)")
    .bind(id, organizer.id, flyerKey, receivedOn, JSON.stringify(extraction))
    .run();

  const text = summary(extraction.events, receivedOn, organizer.first_name);
  const buttons = extraction.events.some((e) => publishable(e, receivedOn))
    ? [
        { id: `publish:${id}`, title: "Veröffentlichen" },
        { id: `edit:${id}`, title: "Ändern ✏️" },
        { id: `discard:${id}`, title: "Verwerfen" },
      ]
    : [{ id: `discard:${id}`, title: "Verwerfen" }];
  return sendButtons(env, message.from, text, buttons);
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
    return sendText(env, from, "Ändern im Browser kommt bald. Bis dahin: Verwerfen und den Flyer korrigiert nochmal schicken.");
  }
  if (action === "publish") {
    const extraction = JSON.parse(submission.extraction) as Extraction;
    const ready = extraction.events.filter((e) => publishable(e, submission.received_on));
    const skipped = extraction.events.filter((e) => !publishable(e, submission.received_on));
    const published = await publishEvents(env.DB, submission, ready);
    await env.DB.prepare("UPDATE submission SET status = 'published' WHERE id = ?").bind(id).run();

    const lines = published.map((p) => `*${p.title}* – ${formatDate(p.startsAt.slice(0, 10), submission.received_on)}\nBearbeiten: ${env.PUBLIC_URL}/e/${p.editToken}`);
    if (skipped.length) lines.push(`Nicht eingetragen: ${skipped.map((e) => e.title).join(", ")}`);
    return sendText(env, from, `✅ Ist online!\n\n${lines.join("\n\n")}\n\nDie Links sind privat – nicht weiterleiten.`);
  }
}

function berlinDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}
