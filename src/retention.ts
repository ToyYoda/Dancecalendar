import { addDays, HORIZON_DAYS } from "./series";

// Retention (the legal ticket's limits), run by the daily cron: past Events go about 3 months after they
// happened, with their Flyers in R2; so do Series long over, handled submissions, and Flyers an
// Organizer never published. Tip data has its own 30-day clean-up (tips.tsx).
// Decisions: .scratch/dance-calendar-mvp/issues/26-retention-and-backups.md

const KEPT_DAYS = 90; // past Events, handled submissions and ended Series
const ABANDONED_DAYS = 30; // an Organizer's Flyer left unconfirmed
const MESSAGE_IDS_DAYS = 7; // Meta re-delivers within hours; the ids only stop duplicates

export async function cleanUpPast(env: Env, today: string) {
  const db = env.DB;
  const cutoff = addDays(today, -KEPT_DAYS);
  // A Festival counts from its last day. Series need their Events gone first.
  const events = await db.prepare("DELETE FROM event WHERE COALESCE(ends_at, starts_at) < ? RETURNING flyer_key").bind(cutoff).all<{ flyer_key: string | null }>();
  const [series, handled, abandoned] = await db.batch<{ flyer_key: string | null }>([
    // A Series is over once ended or run out (12 weeks after its last sign of life) and empty.
    db.prepare(
      `DELETE FROM series
       WHERE (ended_at < ?1 OR date(last_sign_of_life, '+${HORIZON_DAYS} days') < ?1)
         AND NOT EXISTS (SELECT 1 FROM event WHERE event.series_id = series.id)
       RETURNING json_extract(template, '$.flyer_key') AS flyer_key`,
    ).bind(cutoff),
    db.prepare("DELETE FROM submission WHERE status IN ('published', 'discarded') AND created_at < ? RETURNING flyer_key").bind(cutoff),
    db.prepare("DELETE FROM submission WHERE status = 'pending' AND source <> 'tip' AND created_at < ? RETURNING flyer_key").bind(addDays(today, -ABANDONED_DAYS)),
    db.prepare("DELETE FROM inbound_message WHERE received_at < ?").bind(addDays(today, -MESSAGE_IDS_DAYS)),
  ]);
  await deleteUnusedFlyers(env, [...events.results, ...series.results, ...handled.results, ...abandoned.results].map((r) => r.flyer_key));
}

// Deletes the Flyer images nothing refers to any more: no Event, running Series or held Flyer.
export async function deleteUnusedFlyers(env: Env, keys: (string | null)[]) {
  for (const key of new Set(keys.filter((k): k is string => Boolean(k)))) {
    const used = await env.DB.prepare(
      `SELECT 1 FROM event WHERE flyer_key = ?1
       UNION ALL SELECT 1 FROM series WHERE json_extract(template, '$.flyer_key') = ?1 AND ended_at IS NULL
       UNION ALL SELECT 1 FROM submission WHERE flyer_key = ?1 AND status = 'pending' LIMIT 1`,
    )
      .bind(key)
      .first();
    if (!used) await env.FLYERS.delete(key);
  }
}
