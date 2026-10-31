import { Layout } from "./layout";

type FeedEvent = {
  title: string;
  starts_at: string;
  cancelled: number;
  venue: string;
  display_name: string | null;
  shown_as: string | null;
};

// Berlin calendar date `days` from `now`, as "YYYY-MM-DD".
function berlinDate(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

// Events from today (Berlin) through the next 7 days. starts_at is local "YYYY-MM-DDTHH:MM", so text order is time order.
export async function loadWeek(db: D1Database, now: Date): Promise<FeedEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT e.title, e.starts_at, e.cancelled, v.name AS venue, o.display_name, e.shown_as
       FROM event e
       JOIN venue v ON v.id = e.venue_id
       LEFT JOIN organizer o ON o.id = e.organizer_id
       WHERE e.starts_at >= ? AND e.starts_at < ?
       ORDER BY e.starts_at`,
    )
    .bind(berlinDate(now, 0), berlinDate(now, 8))
    .all<FeedEvent>();
  return results;
}

function dayHeading(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function WeekFeed(props: { events: FeedEvent[] }) {
  const days = Map.groupBy(props.events, (e) => e.starts_at.slice(0, 10));
  return (
    <Layout title="DanceCalendar">
      <h1>DanceCalendar</h1>
      {days.size === 0 && <p>In den nächsten 7 Tagen ist noch nichts eingetragen.</p>}
      {[...days].map(([date, events]) => (
        <section>
          <h2>{dayHeading(date)}</h2>
          <ul>
            {events.map((e) => (
              <li>
                <strong>{e.starts_at.slice(11)}</strong> {e.title}
                {e.cancelled ? " (abgesagt)" : ""}
                <br />
                {e.venue} · {e.display_name ?? e.shown_as}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Layout>
  );
}
