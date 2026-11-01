import { seriesEnding } from "./admin-tools";
import type { Extraction } from "./extraction/extract";
import { addDays, ruleWords, type Rule } from "./series";
import { berlinDate } from "./whatsapp/bot";
import { formatDate } from "./whatsapp/summary";

// The Admin's daily email at 21:00 German time, sent through Cloudflare Email only when something is
// pending: Tips and free-text Series rules to review, new Organizers with their first Event, and Series
// running out within 7 days. Each item links to its Admin page. Cron runs in UTC, so it fires at 19:00
// and 20:00 UTC and only the run that is 21:00 in Berlin sends.
// Decisions: .scratch/dance-calendar-mvp/issues/11-admin-view.md

export const EMAIL_CRON = "0 19,20 * * *";
const NEW_SINCE = "-1 day"; // an Organizer is new in the first email after they joined

export function digestDue(now: Date): boolean {
  return now.toLocaleString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }) === "21";
}

// "sent", "nothing" when nothing is pending, "unconfigured" without the email binding and addresses.
export async function sendDailyEmail(env: Env, now: Date): Promise<"sent" | "nothing" | "unconfigured"> {
  const digest = await composeDigest(env, now);
  if (!digest) return "nothing";
  if (!env.EMAIL || !env.ADMIN_EMAIL || !env.EMAIL_FROM) {
    console.warn("daily email not sent: EMAIL, ADMIN_EMAIL or EMAIL_FROM is missing");
    return "unconfigured";
  }
  await env.EMAIL.send({ from: { name: "DanceCalendar", email: env.EMAIL_FROM }, to: env.ADMIN_EMAIL, subject: digest.subject, text: digest.text });
  return "sent";
}

async function composeDigest(env: Env, now: Date): Promise<{ subject: string; text: string } | null> {
  const db = env.DB;
  const today = berlinDate(now);
  const url = env.PUBLIC_URL;
  const nowSql = now.toISOString().slice(0, 19).replace("T", " "); // created_at is UTC "YYYY-MM-DD HH:MM:SS"

  const [tips, rules, organizers] = await db.batch([
    db.prepare("SELECT confirm_token, received_on, extraction FROM submission WHERE source = 'tip' AND status = 'pending' ORDER BY created_at"),
    db.prepare(
      `SELECT json_extract(template, '$.title') AS title, rule, edit_token FROM series
       WHERE ended_at IS NULL AND json_extract(rule, '$.freq') = 'custom' ORDER BY created_at`,
    ),
    db.prepare(
      `SELECT o.display_name, o.first_name,
              EXISTS (SELECT 1 FROM organizer p WHERE p.display_name = o.display_name AND p.id < o.id) AS joined,
              (SELECT title || '|' || starts_at FROM event e WHERE e.organizer_id = o.id ORDER BY e.created_at, e.id LIMIT 1) AS first_event
       FROM organizer o WHERE o.blocked_at IS NULL AND o.created_at > datetime(?, '${NEW_SINCE}') ORDER BY o.created_at, o.id`,
    ).bind(nowSql),
  ]);
  const ending = await seriesEnding(db, today, addDays(today, 7));

  const sections: { heading: string; lines: string[] }[] = [];
  const tipRows = tips.results as { confirm_token: string; received_on: string; extraction: string }[];
  if (tipRows.length) {
    sections.push({
      heading: `Tipps prüfen (${tipRows.length})`,
      lines: tipRows.map((t) => {
        const first = (JSON.parse(t.extraction) as Extraction).events[0];
        const when = first?.start_date ? ` – ${formatDate(first.start_date, today)}` : "";
        return `- ${first?.title || "(ohne Titel)"}${when}\n  ${url}/admin/tips/${t.confirm_token}`;
      }),
    });
  }
  const ruleRows = rules.results as { title: string; rule: string; edit_token: string }[];
  if (ruleRows.length) {
    sections.push({
      heading: `Freie Wiederholungen prüfen (${ruleRows.length})`,
      lines: ruleRows.map((r) => `- ${r.title}: ${ruleWords(JSON.parse(r.rule) as Rule)}\n  ${url}/s/${r.edit_token}`),
    });
  }
  const organizerRows = organizers.results as { display_name: string; first_name: string | null; joined: number; first_event: string | null }[];
  if (organizerRows.length) {
    const lines = organizerRows.map((o) => {
      const notes = [o.joined ? `tritt dem bestehenden Display name „${o.display_name}“ bei` : ""];
      if (o.first_event) {
        const [title, startsAt] = [o.first_event.slice(0, o.first_event.lastIndexOf("|")), o.first_event.slice(o.first_event.lastIndexOf("|") + 1)];
        notes.push(`erstes Event: ${title}, ${formatDate(startsAt.slice(0, 10), today)}`);
      } else {
        notes.push("noch kein Event");
      }
      return `- ${o.display_name} (${o.first_name ?? "?"}) – ${notes.filter(Boolean).join("; ")}`;
    });
    sections.push({ heading: `Neue Organizer (${organizerRows.length})`, lines: [...lines, `  ${url}/admin/organizers`] });
  }
  if (ending.length) {
    sections.push({
      heading: `Serien, die in den nächsten 7 Tagen auslaufen (${ending.length})`,
      lines: [...ending.map((s) => `- ${s.title} (${s.posted_by ?? "?"}) – läuft aus am ${formatDate(s.runs_out, today)}`), `  ${url}/admin/series`],
    });
  }
  if (sections.length === 0) return null;

  const count = tipRows.length + ruleRows.length + organizerRows.length + ending.length;
  const text = [
    `Heute (${formatDate(today, today)}) wartet im DanceCalendar:`,
    ...sections.map((s) => `${s.heading}\n${s.lines.join("\n")}`),
    `Admin: ${url}/admin`,
  ].join("\n\n");
  return { subject: `DanceCalendar: ${count} ${count === 1 ? "Punkt" : "Punkte"} für dich`, text };
}
