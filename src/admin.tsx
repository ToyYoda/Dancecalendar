import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { sendDailyEmail } from "./admin-email";
import { adminTools } from "./admin-tools";
import { Layout } from "./layout";
import { tipReview } from "./tips";
import * as telegram from "./telegram/api";
import { queueUpload, waitForUpload } from "./upload";

// /admin, behind a password (the ADMIN_SECRET Worker secret) until Cloudflare Access comes with Deploy.
// /admin/upload seeds the calendar with Flyers published under a chosen Organizer (see upload.tsx).
// /admin/telegram connects the Telegram bot (src/telegram).
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

// The Telegram bot: what Telegram has on record, and one button that points its webhook at this Worker.
admin.get("/telegram", async (c) => c.html(<TelegramPage {...(await telegramState(c.env))} />));
admin.post("/telegram", async (c) => {
  const done = await telegram.connect(c.env).then(
    () => "✅ Webhook und Befehle sind eingerichtet.",
    (err) => `Das hat nicht geklappt: ${err instanceof Error ? err.message : err}`,
  );
  return c.html(<TelegramPage {...(await telegramState(c.env))} note={done} />);
});

async function telegramState(env: Env) {
  if (!env.TELEGRAM_BOT_TOKEN) return { error: "Der Secret TELEGRAM_BOT_TOKEN fehlt noch." };
  return telegram.status(env).then(
    (s) => ({ ...s, expected: `${env.PUBLIC_URL}/telegram` }),
    (err) => ({ error: `Telegram antwortet nicht: ${err instanceof Error ? err.message : err}` }),
  );
}

function TelegramPage(props: {
  note?: string;
  error?: string;
  username?: string;
  url?: string;
  expected?: string;
  pending?: number;
  lastError?: string;
}) {
  return (
    <Layout title="Telegram – DanceCalendar">
      <p>
        <a href="/admin">← Admin</a>
      </p>
      <h1>Telegram-Bot</h1>
      {props.note && <p>{props.note}</p>}
      {props.error ? (
        <p>{props.error}</p>
      ) : (
        <ul>
          <li>
            Bot: <a href={`https://t.me/${props.username}`}>@{props.username}</a>
          </li>
          <li>
            Webhook: {props.url || "keiner"} {props.url === props.expected ? "✅" : `(erwartet: ${props.expected})`}
          </li>
          <li>Wartende Nachrichten: {props.pending}</li>
          {props.lastError && <li>Letzter Fehler: {props.lastError}</li>}
        </ul>
      )}
      {!props.error && (
        <form method="post" action="/admin/telegram">
          <button type="submit">Webhook einrichten</button>
        </form>
      )}
    </Layout>
  );
}

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
    ["/admin/telegram", "Telegram-Bot"],
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
