import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { sendDailyEmail } from "./admin-email";
import { adminTools } from "./admin-tools";
import { Layout } from "./layout";
import { tipReview } from "./tips";
import { queueUpload, waitForUpload } from "./upload";

// /admin, behind a password (the ADMIN_SECRET Worker secret) until Cloudflare Access comes with Deploy.
// /admin/upload seeds the calendar with Flyers published under a chosen Organizer (see upload.tsx).
// /admin/tips is the review queue of Tips and free-text Series rules (see tips.tsx).
// Organizers, Events, Series ending soon and Venues: admin-tools.tsx. The daily email: admin-email.ts.

export const admin = new Hono<{ Bindings: Env }>();

admin.use("*", async (c, next) => {
  if (!c.env.ADMIN_SECRET) return c.text("Admin ist noch nicht eingerichtet.", 503);
  return basicAuth({ username: "admin", password: c.env.ADMIN_SECRET, realm: "DanceCalendar Admin" })(c, next);
});

admin.route("/tips", tipReview);
admin.route("/", adminTools);

admin.get("/", (c) => c.html(<Home />));

// The daily email's job, run by hand: it sends only when something is pending.
admin.post("/email", async (c) => {
  const result = await sendDailyEmail(c.env, new Date());
  const notes = {
    sent: "✅ E-Mail gesendet.",
    nothing: "Nichts zu melden, keine E-Mail gesendet.",
    unconfigured: "Die E-Mail ist noch nicht eingerichtet (EMAIL, ADMIN_EMAIL, EMAIL_FROM).",
  };
  return c.html(<Home note={notes[result]} />);
});

function Home(props: { note?: string }) {
  const links = [
    ["/admin/tips", "Prüfen: Tipps und freie Wiederholungen"],
    ["/admin/organizers", "Organizer"],
    ["/admin/events", "Events"],
    ["/admin/series", "Serien, die bald auslaufen"],
    ["/admin/venues", "Orte"],
    ["/admin/upload", "Flyer hochladen"],
  ];
  return (
    <Layout title="Admin – DanceCalendar">
      <h1>Admin</h1>
      {props.note && <p>{props.note}</p>}
      <ul>
        {links.map(([href, label]) => (
          <li>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
      <form method="post" action="/admin/email" style="margin-top:1.5rem">
        <button type="submit">Tägliche E-Mail jetzt senden</button>
      </form>
    </Layout>
  );
}

admin.get("/upload", async (c) => c.html(<UploadForm organizers={await organizers(c.env.DB)} />));

admin.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const organizer = (await organizers(c.env.DB)).find((o) => String(o.id) === body.organizer_id);
  const token = organizer && (await queueUpload(c.env, body.flyer, organizer.id, "admin"));
  if (!token) {
    return c.html(<UploadForm organizers={await organizers(c.env.DB)} error="Bitte ein Bild (JPEG, PNG, WebP) und einen Organizer wählen." />, 400);
  }
  return c.redirect(`/admin/upload/${token}`, 303);
});

admin.get("/upload/:token", (c) => waitForUpload(c, c.req.param("token"), null, "/admin/upload"));

async function organizers(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, display_name FROM organizer WHERE blocked_at IS NULL ORDER BY display_name")
    .all<{ id: number; display_name: string }>();
  return results;
}

function UploadForm(props: { organizers: { id: number; display_name: string }[]; error?: string }) {
  return (
    <Layout title="Flyer hochladen – DanceCalendar">
      <h1>Flyer hochladen</h1>
      {props.error && <p style="color:#a30000">{props.error}</p>}
      {props.organizers.length === 0 ? (
        <p>Es gibt noch keine Organizer, unter denen veröffentlicht werden kann.</p>
      ) : (
        <form method="post" enctype="multipart/form-data">
          <p>
            <label>
              Flyer (Bild)
              <br />
              <input type="file" name="flyer" accept="image/jpeg,image/png,image/webp" required />
            </label>
          </p>
          <p>
            <label>
              Veröffentlichen als
              <br />
              <select name="organizer_id" required>
                {props.organizers.map((o) => (
                  <option value={String(o.id)}>{o.display_name}</option>
                ))}
              </select>
            </label>
          </p>
          <button type="submit">Hochladen und auslesen</button>
        </form>
      )}
    </Layout>
  );
}
