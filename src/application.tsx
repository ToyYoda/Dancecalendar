import { Hono } from "hono";
import { extractFlyer, type Extraction } from "./extraction/extract";
import { Layout } from "./layout";
import { randomToken } from "./publish";
import { holdTip } from "./tips";
import { sendButtons, sendText } from "./whatsapp/graph";
import { offerFlyer, storeFlyer, type Organizer } from "./whatsapp/bot";
import type { InboundMessage } from "./whatsapp/types";

// An unregistered number sends a Flyer: the bot asks whether it's their own Event. "Ja, meine" holds
// the Flyer, sends a single-use apply link (/a/<token>, 24 hours) and reads the Flyer meanwhile; the
// form makes the sender an Organizer at once (auto-approved), and the bot continues with the held
// Flyer's summary. "Nein, ist ein Tipp" reads the Flyer as a Tip (src/tips.tsx) and is remembered per
// number. Held Flyers go after 24 hours.
// Decisions: .scratch/dance-calendar-mvp/issues/12-organizer-application.md

const VALID = "created_at > datetime('now', '-24 hours')";

type Application = {
  id: string;
  whatsapp_number: string;
  flyer_key: string;
  mime_type: string;
  received_on: string;
  extraction: string | null;
  token: string | null;
  completed_at: string | null;
};

export async function askOwnership(env: Env, message: InboundMessage) {
  const held = await storeFlyer(env, message);
  await env.DB.prepare("INSERT INTO application (id, whatsapp_number, flyer_key, mime_type, received_on) VALUES (?, ?, ?, ?, ?)")
    .bind(held.id, message.from, held.flyerKey, held.mimeType, held.receivedOn)
    .run();
  return sendButtons(env, message.from, "Danke für den Flyer! Ist das deine Veranstaltung?", [
    { id: `mine:${held.id}`, title: "Ja, meine" },
    { id: `tip:${held.id}`, title: "Nein, ist ein Tipp" },
  ]);
}

// Safe to run twice: a retried "Ja" sends no second link and reads the Flyer only once; a retried "Nein" holds one Tip.
export async function answerOwnership(env: Env, from: string, buttonId: string) {
  const [action, id] = buttonId.split(":");
  const app = await env.DB.prepare(`SELECT * FROM application WHERE id = ? AND whatsapp_number = ? AND ${VALID}`)
    .bind(id, from)
    .first<Application>();
  if (!app) return sendText(env, from, "Dieser Flyer ist schon erledigt. Schick ihn einfach nochmal.");

  if (action === "tip") {
    // Read first, so a failed read is retried with the application still there.
    const extraction = await readHeld(env, app);
    if (!extraction) return;
    const { meta } = await env.DB.prepare("DELETE FROM application WHERE id = ?").bind(id).run();
    if (meta.changes !== 1) return;
    return holdTip(env, from, { id: app.id, flyerKey: app.flyer_key, receivedOn: app.received_on }, extraction);
  }

  const token = randomToken();
  const { meta } = await env.DB.prepare("UPDATE application SET token = ? WHERE id = ? AND token IS NULL").bind(token, id).run();
  if (meta.changes === 1) {
    await sendText(
      env,
      from,
      `Super! Melde dich hier einmal kurz an, dann geht's direkt mit deinem Flyer weiter:\n${env.PUBLIC_URL}/a/${token}\n\nDer Link gilt 24 Stunden und ist privat.`,
    );
  }
  if (!(await readHeld(env, app))) return;
  await resume(env, id);
}

// The held Flyer as read, reading it once; null when it's gone.
async function readHeld(env: Env, app: Application): Promise<Extraction | null> {
  if (app.extraction !== null) return JSON.parse(app.extraction);
  const object = await env.FLYERS.get(app.flyer_key);
  if (!object) return null;
  const extraction = await extractFlyer(env.ANTHROPIC_API_KEY, await object.arrayBuffer(), app.mime_type, app.received_on);
  await env.DB.prepare("UPDATE application SET extraction = ? WHERE id = ?").bind(JSON.stringify(extraction), app.id).run();
  return extraction;
}

// Once the form is in and the Flyer is read, whichever comes last, the held Flyer continues as the
// new Organizer's submission, exactly once.
async function resume(env: Env, id: string) {
  const app = await env.DB.prepare(
    `UPDATE application SET resumed_at = datetime('now')
     WHERE id = ? AND completed_at IS NOT NULL AND extraction IS NOT NULL AND resumed_at IS NULL RETURNING *`,
  )
    .bind(id)
    .first<Application>();
  if (!app) return;
  const organizer = await env.DB.prepare("SELECT id, first_name FROM organizer WHERE whatsapp_number = ? AND blocked_at IS NULL")
    .bind(app.whatsapp_number)
    .first<Organizer>();
  if (!organizer) return;
  const held = { id: app.id, flyerKey: app.flyer_key, receivedOn: app.received_on };
  await offerFlyer(env, app.whatsapp_number, organizer, held, JSON.parse(app.extraction!));
}

// Cron: held Flyers go after 24 hours, unless they moved on to a submission.
export async function cleanUpApplications(env: Env) {
  const { results } = await env.DB.prepare(`SELECT flyer_key, resumed_at FROM application WHERE NOT ${VALID}`).all<{
    flyer_key: string;
    resumed_at: string | null;
  }>();
  for (const r of results) if (!r.resumed_at) await env.FLYERS.delete(r.flyer_key);
  await env.DB.prepare(`DELETE FROM application WHERE NOT ${VALID}`).run();
}

export const applyPage = new Hono<{ Bindings: Env }>();

applyPage.get("/:token", async (c) => {
  const app = await load(c.env.DB, c.req.param("token"));
  if (!app) return c.notFound();
  if (!app.valid || app.completed_at) return c.html(<Expired />);
  return c.html(<ApplyForm names={await displayNames(c.env.DB)} />);
});

applyPage.post("/:token", async (c) => {
  const app = await load(c.env.DB, c.req.param("token"));
  if (!app) return c.notFound();
  if (!app.valid || app.completed_at) return c.html(<Expired />, 410);

  const form = await c.req.formData();
  const typed = String(form.get("display_name") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const firstName = String(form.get("first_name") ?? "").trim().slice(0, 60);
  const names = await displayNames(c.env.DB);
  if (!typed || !firstName || form.get("terms") !== "on") {
    const error = "Bitte Name, Vorname und das Häkchen ausfüllen.";
    return c.html(<ApplyForm names={names} displayName={typed} firstName={firstName} error={error} />, 422);
  }
  // Typing an existing Display name joins it, in its existing spelling.
  const displayName = names.find((n) => n.toLowerCase() === typed.toLowerCase()) ?? typed;

  const { meta } = await c.env.DB.prepare("UPDATE application SET completed_at = datetime('now') WHERE id = ? AND completed_at IS NULL")
    .bind(app.id)
    .run();
  if (meta.changes !== 1) return c.html(<Expired />, 410);
  await c.env.DB.prepare(
    "INSERT INTO organizer (whatsapp_number, display_name, first_name) VALUES (?, ?, ?) ON CONFLICT (whatsapp_number) DO NOTHING",
  )
    .bind(app.whatsapp_number, displayName, firstName)
    .run();
  // The page says "Fertig" even if WhatsApp fails; the Organizer can just send the Flyer again.
  await resume(c.env, app.id).catch((err) => console.error("resuming the held Flyer failed", err));
  return c.html(<Done />);
});

async function load(db: D1Database, token: string) {
  return db
    .prepare(`SELECT id, whatsapp_number, completed_at, ${VALID} AS valid FROM application WHERE token = ?`)
    .bind(token)
    .first<{ id: string; whatsapp_number: string; completed_at: string | null; valid: number }>();
}

async function displayNames(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT display_name FROM organizer WHERE blocked_at IS NULL ORDER BY display_name")
    .all<{ display_name: string }>();
  return results.map((r) => r.display_name);
}

function ApplyForm(props: { names: string[]; displayName?: string; firstName?: string; error?: string }) {
  return (
    <Layout title="Anmelden – DanceCalendar" head={<style>{CSS}</style>}>
      <h1>Als Veranstalter*in anmelden</h1>
      <p>Einmal kurz, dann trägst du deine Flyer selbst per WhatsApp ein.</p>
      {props.error && <p class="error">{props.error}</p>}
      <form method="post">
        <label for="display_name">Unter welchem Namen sollen deine Events erscheinen?</label>
        <input id="display_name" name="display_name" list="names" value={props.displayName ?? ""} required maxlength={60} autocomplete="off" />
        <div class="hint">Öffentlich, z. B. „Salsa Kassel“. Gibt es den Namen schon, trittst du ihm bei.</div>
        <datalist id="names">
          {props.names.map((n) => (
            <option value={n} />
          ))}
        </datalist>
        <label for="first_name">Dein Vorname</label>
        <input id="first_name" name="first_name" value={props.firstName ?? ""} required maxlength={60} autocomplete="given-name" />
        <div class="hint">Nicht öffentlich, nur für den Admin.</div>
        <label class="check">
          <input type="checkbox" name="terms" required /> Ich akzeptiere die{" "}
          <a href="/nutzungsbedingungen" target="_blank">
            Nutzungsbedingungen
          </a>{" "}
          und erlaube DanceCalendar, meine Flyer und Events öffentlich zu zeigen. Ich habe die Rechte daran. Wie wir mit deinen Daten umgehen, steht im{" "}
          <a href="/datenschutz" target="_blank">
            Datenschutz
          </a>
          .
        </label>
        <button type="submit">Anmelden</button>
      </form>
    </Layout>
  );
}

function Done() {
  return (
    <Layout title="Fertig – DanceCalendar">
      <h1>Fertig! Zurück zu WhatsApp</h1>
      <p>Dort geht's direkt mit deinem Flyer weiter. Ab jetzt schickst du Flyer einfach an den Bot.</p>
    </Layout>
  );
}

function Expired() {
  return (
    <Layout title="Link abgelaufen – DanceCalendar">
      <h1>Der Link ist abgelaufen</h1>
      <p>Schick den Flyer einfach nochmal an den Bot.</p>
    </Layout>
  );
}

const CSS = `
  form label { display: block; margin-top: 1rem; font-weight: bold; }
  form input:not([type=checkbox]) { width: 100%; box-sizing: border-box; border: 1px solid #e4dfd8; border-radius: 6px; padding: .5rem; font: inherit; }
  .hint { font-size: .8rem; color: #6f6861; }
  label.check { font-weight: normal; }
  button { width: 100%; margin-top: 1.25rem; padding: .75rem; font: inherit; font-weight: bold; border: 0; border-radius: 8px; background: #c2185b; color: #fff; }
  .error { color: #a30000; }
`;
