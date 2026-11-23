// Telegram Bot API calls: https://core.telegram.org/bots/api
// The bot token is the TELEGRAM_BOT_TOKEN Worker secret, made with @BotFather.

import type { Button } from "../messenger";

const API = "https://api.telegram.org";
const MAX_TEXT = 4096; // characters per message

async function call<T = unknown>(env: Env, method: string, body: object): Promise<T> {
  const res = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(`Telegram ${method} failed: ${res.status} ${data?.description ?? ""}`);
  return data.result as T;
}

export async function sendText(env: Env, chatId: string, text: string) {
  for (let i = 0; i < text.length; i += MAX_TEXT) {
    await call(env, "sendMessage", { chat_id: chatId, text: text.slice(i, i + MAX_TEXT), link_preview_options: { is_disabled: true } });
  }
}

// Inline buttons, one per row so the longer titles stay readable. A tap comes back as a callback_query
// whose data is the button's id (at most 64 bytes, which all of the bot's ids stay under).
export async function sendButtons(env: Env, chatId: string, text: string, buttons: Button[]) {
  const short = text.length <= MAX_TEXT;
  if (!short) await sendText(env, chatId, text);
  await call(env, "sendMessage", {
    chat_id: chatId,
    text: short ? text : "Wie soll es weitergehen?",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.title, callback_data: b.id }]) },
  });
}

// Stops the spinner on a tapped button.
export async function answerCallback(env: Env, callbackQueryId: string) {
  await call(env, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

// Telegram keeps files for at least an hour; the Flyer still goes to R2 right away.
export async function downloadFile(env: Env, fileId: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const { file_path } = await call<{ file_path?: string }>(env, "getFile", { file_id: fileId });
  if (!file_path) throw new Error("Telegram file has no path");
  const file = await fetch(`${API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${file_path}`);
  if (!file.ok) throw new Error(`Telegram file download failed: ${file.status}`);
  const ext = file_path.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { bytes: await file.arrayBuffer(), mimeType };
}

// The secret Telegram sends back in every webhook call, derived from the bot token so no second
// secret has to be kept. Telegram allows A-Z, a-z, 0-9, _ and -, up to 256 characters.
export async function webhookSecret(env: Env): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`dancecalendar-webhook:${env.TELEGRAM_BOT_TOKEN}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Points Telegram at this Worker and sets the bot's command menu. Run from /admin/telegram.
export async function connect(env: Env) {
  await call(env, "setWebhook", {
    url: `${env.PUBLIC_URL}/telegram`,
    secret_token: await webhookSecret(env),
    allowed_updates: ["message", "callback_query"],
  });
  await call(env, "setMyCommands", {
    commands: [
      { command: "start", description: "Begrüßung und Hinweise" },
      { command: "admin", description: "Einen Menschen erreichen" },
      { command: "stop", description: "Keine Nachrichten mehr" },
    ],
  });
}

export async function status(env: Env) {
  const me = await call<{ username: string }>(env, "getMe", {});
  const hook = await call<{ url: string; pending_update_count: number; last_error_message?: string }>(env, "getWebhookInfo", {});
  return { username: me.username, url: hook.url, pending: hook.pending_update_count, lastError: hook.last_error_message };
}
