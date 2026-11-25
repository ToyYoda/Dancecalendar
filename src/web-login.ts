import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sendButtons, sendText } from "./messenger";
import { randomToken } from "./publish";

// Logging in on the website (the Organizer area, src/portal.tsx). A session is one cookie whose SHA-256
// names a web_session row; the row holds the address the browser acts as, the same address the bot
// knows the Organizer by ("tg:<chat id>"). Ways in:
// - Telegram: the browser opens the bot with a one-time code, the bot asks "Warst du das?", a yes logs
//   the browser in. The code is bound to a cookie of the browser that asked, and lasts 10 minutes.
// - Google (only once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set): see src/portal.tsx.

export const SESSION_COOKIE = "dc_session";
export const LOGIN_COOKIE = "dc_login";
const SESSION_DAYS = 90;
export const LOGIN_MINUTES = 10;
const FRESH = `created_at > datetime('now', '-${LOGIN_MINUTES} minutes')`;

type C = Context<{ Bindings: Env }>;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Four digits the browser and the bot both show, so the Organizer can see they belong together.
export async function checkDigits(code: string): Promise<string> {
  return String(parseInt((await sha256(`check:${code}`)).slice(0, 8), 16) % 10000).padStart(4, "0");
}

const cookieOptions = (c: C) => ({ httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax" as const, path: "/" });

// The address this browser is logged in as, or null.
export async function sessionAddress(c: C): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare("SELECT address FROM web_session WHERE id = ? AND expires_at > datetime('now')")
    .bind(await sha256(token))
    .first<{ address: string }>();
  return row?.address ?? null;
}

export async function startSession(c: C, address: string) {
  const token = randomToken() + randomToken();
  await c.env.DB.prepare(`INSERT INTO web_session (id, address, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`)
    .bind(await sha256(token), address)
    .run();
  setCookie(c, SESSION_COOKIE, token, { ...cookieOptions(c), maxAge: SESSION_DAYS * 86400 });
}

export async function endSession(c: C) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM web_session WHERE id = ?").bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
}

// A browser starts a Telegram login: a code for the bot's link, and a cookie only this browser has.
export async function startTelegramLogin(c: C): Promise<string> {
  const code = randomToken();
  const secret = randomToken();
  await c.env.DB.prepare("INSERT INTO login_request (code, browser) VALUES (?, ?)").bind(code, await sha256(secret)).run();
  setCookie(c, LOGIN_COOKIE, secret, { ...cookieOptions(c), maxAge: LOGIN_MINUTES * 60 });
  return code;
}

// Where a Telegram login stands, seen from the browser that started it.
export async function telegramLoginState(c: C, code: string): Promise<{ state: "wait" | "gone" } | { state: "ok"; address: string }> {
  const secret = getCookie(c, LOGIN_COOKIE);
  if (!secret || !code) return { state: "gone" };
  const row = await c.env.DB.prepare(`SELECT address, confirmed_at FROM login_request WHERE code = ? AND browser = ? AND ${FRESH}`)
    .bind(code, await sha256(secret))
    .first<{ address: string | null; confirmed_at: string | null }>();
  if (!row) return { state: "gone" };
  return row.confirmed_at && row.address ? { state: "ok", address: row.address } : { state: "wait" };
}

export async function finishTelegramLogin(c: C, code: string) {
  await c.env.DB.prepare("DELETE FROM login_request WHERE code = ?").bind(code).run();
  deleteCookie(c, LOGIN_COOKIE, cookieOptions(c));
}

const START = /^\/start\s+login-([\w-]{16,40})$/;
const TAP = /^(login|nologin):([\w-]{16,40})$/;

// The bot's half, called by the Telegram webhook before an update is queued. True if it was a login.
export async function handleTelegramLogin(env: Env, update: any): Promise<boolean> {
  const m = update?.message;
  const start = m?.chat?.type === "private" && typeof m.text === "string" ? m.text.trim().match(START) : null;
  if (start) {
    const to = `tg:${m.chat.id}`;
    const open = await env.DB.prepare(`SELECT code FROM login_request WHERE code = ? AND confirmed_at IS NULL AND ${FRESH}`).bind(start[1]).first();
    if (!open) {
      await sendText(env, to, "Dieser Anmeldelink ist abgelaufen. Starte die Anmeldung auf der Website einfach nochmal.");
      return true;
    }
    await sendButtons(
      env,
      to,
      `Jemand möchte sich mit deinem Telegram auf der Website von Taktvoll anmelden (Prüfcode ${await checkDigits(start[1])}).\n\n` +
        "Bestätige nur, wenn du das gerade selbst im Browser gestartet hast und dort derselbe Prüfcode steht.",
      [
        { id: `login:${start[1]}`, title: "Ja, das war ich" },
        { id: `nologin:${start[1]}`, title: "Nein, abbrechen" },
      ],
    );
    return true;
  }

  const cq = update?.callback_query;
  const tap = typeof cq?.data === "string" ? cq.data.match(TAP) : null;
  if (tap && cq.from?.id && (!cq.message || cq.message.chat?.type === "private")) {
    const to = `tg:${cq.from.id}`;
    if (tap[1] === "nologin") {
      await env.DB.prepare("DELETE FROM login_request WHERE code = ? AND confirmed_at IS NULL").bind(tap[2]).run();
      await sendText(env, to, "Abgebrochen. Niemand wurde angemeldet.");
      return true;
    }
    const { meta } = await env.DB.prepare(
      `UPDATE login_request SET address = ?, confirmed_at = datetime('now') WHERE code = ? AND confirmed_at IS NULL AND ${FRESH}`,
    )
      .bind(to, tap[2])
      .run();
    await sendText(env, to, meta.changes === 1 ? "Du bist angemeldet. Im Browser geht es gleich weiter." : "Dieser Anmeldelink ist abgelaufen. Starte die Anmeldung auf der Website einfach nochmal.");
    return true;
  }
  return false;
}

// Cron: old sessions and unfinished logins go.
export async function cleanUpLogins(env: Env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM web_session WHERE expires_at <= datetime('now')"),
    env.DB.prepare(`DELETE FROM login_request WHERE NOT ${FRESH}`),
  ]);
}
