import type { Context } from "hono";
import { sendMail } from "./mail";
import { randomToken } from "./publish";
import { sha256 } from "./web-login";

// Logging in at /veranstalter with an email address (ADR 0006). The Organizer enters an address, we
// email a link (src/mail.ts, through Brevo), and opening it shows one button that logs the browser in.
// The button is there because mail scanners open links on their own; only a POST uses the link up.
// A link works once and for 15 minutes. Whoever can read the inbox can log in, as with any password reset.
// The address is never shown to the public; the routes are in src/portal.tsx.

export const EMAIL_LINK_MINUTES = 15;
const PER_ADDRESS = 3; // links per address within EMAIL_LINK_MINUTES; more are silently not sent
const PER_DAY = 250; // all links in 24 hours, below Brevo's free 300 per day, leaving room for the Admin's email
const FRESH = `created_at > datetime('now', '-${EMAIL_LINK_MINUTES} minutes')`;

type C = Context<{ Bindings: Env }>;

// The address in lowercase, or null if it isn't one.
export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email) ? email : null;
}

// Sends a login link. "limited" looks the same to the browser as "sent", so nobody learns from the page
// whether an address is known or how often it was asked for.
export async function sendEmailLink(c: C, email: string): Promise<"sent" | "limited" | "failed"> {
  const db = c.env.DB;
  const [mine, all] = await db.batch<{ n: number }>([
    db.prepare(`SELECT COUNT(*) AS n FROM email_login WHERE email = ? AND ${FRESH}`).bind(email),
    db.prepare("SELECT COUNT(*) AS n FROM email_login WHERE created_at > datetime('now', '-1 day')"),
  ]);
  if (mine.results[0].n >= PER_ADDRESS) return "limited";
  if (all.results[0].n >= PER_DAY) {
    console.warn("email login: daily cap reached");
    return "limited";
  }

  const token = randomToken() + randomToken();
  await db.prepare("INSERT INTO email_login (id, email) VALUES (?, ?)").bind(await sha256(token), email).run();
  const link = `${new URL(c.req.url).origin}/veranstalter/login/email/${token}`;
  const result = await sendMail(c.env, {
    to: email,
    subject: "Dein Anmeldelink für Stepdate",
    text: [
      "Hallo!",
      "Mit diesem Link meldest du dich bei Stepdate an, um deine Events zu sehen und zu bearbeiten:",
      link,
      `Der Link gilt ${EMAIL_LINK_MINUTES} Minuten und nur einmal.`,
      "Hast du keine Anmeldung gestartet? Dann ignoriere diese E-Mail einfach. Ohne den Link kann sich niemand anmelden.",
      "Stepdate",
    ].join("\n\n"),
  });
  return result === "sent" ? "sent" : "failed";
}

// The address a link is for, while it is fresh and unused; it is not used up.
export async function emailOfLink(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT email FROM email_login WHERE id = ? AND used_at IS NULL AND ${FRESH}`)
    .bind(await sha256(token))
    .first<{ email: string }>();
  return row?.email ?? null;
}

// Uses the link up and returns its address, or null if it was used, too old or never sent.
export async function useEmailLink(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare(`UPDATE email_login SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL AND ${FRESH} RETURNING email`)
    .bind(await sha256(token))
    .first<{ email: string }>();
  return row?.email ?? null;
}

// The account an address logs in as: the one it was added to before, else a Google login with the same
// verified address, else `fallback` (the browser's current login, or a new "web:" account).
export async function addressForEmail(db: D1Database, email: string, fallback: string): Promise<string> {
  const known = await db
    .prepare(
      `SELECT address FROM web_login WHERE (provider = 'email' AND subject = ?) OR (provider = 'google' AND email = ?)
       ORDER BY provider = 'email' DESC, created_at LIMIT 1`,
    )
    .bind(email, email)
    .first<{ address: string }>();
  const address = known?.address ?? fallback;
  await db
    .prepare("INSERT INTO web_login (provider, subject, address, email) VALUES ('email', ?, ?, ?) ON CONFLICT (provider, subject) DO NOTHING")
    .bind(email, address, email)
    .run();
  return address;
}

