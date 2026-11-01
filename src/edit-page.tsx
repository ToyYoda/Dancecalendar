import { Layout } from "./layout";
import { formatDate } from "./whatsapp/summary";

// The target of an Event's private edit link. Editing itself comes with ticket 19; for now it shows the Event.

export async function loadByEditToken(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT e.title, e.starts_at, e.cancelled, v.name AS venue
       FROM event e JOIN venue v ON v.id = e.venue_id WHERE e.edit_token = ?`,
    )
    .bind(token)
    .first<{ title: string; starts_at: string; cancelled: number; venue: string }>();
}

export function EditPage(props: { event: NonNullable<Awaited<ReturnType<typeof loadByEditToken>>> }) {
  const e = props.event;
  return (
    <Layout title={`${e.title} – DanceCalendar`}>
      <h1>{e.title}</h1>
      <p>
        {formatDate(e.starts_at.slice(0, 10), new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }))} · {e.starts_at.slice(11)} · {e.venue}
      </p>
      <p>Bearbeiten und Absagen sind hier bald möglich.</p>
    </Layout>
  );
}
