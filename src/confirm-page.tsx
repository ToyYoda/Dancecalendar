import { Hono } from "hono";
import { duplicatesOfExtracted } from "./duplicates";
import { Card, CARD_CSS, fromForm, missing } from "./event-card";
import type { ExtractedEvent, Extraction } from "./extraction/extract";
import { Layout } from "./layout";
import { editLink, findVenue, publishSubmission, venueQuery, type Held, type Published } from "./publish";
import { berlinDate } from "./whatsapp/bot";
import { sendText } from "./whatsapp/graph";
import { guessVenue } from "./whatsapp/questions";
import { formatDate, uncertainFields } from "./whatsapp/summary";

// The private web confirm page (/c/<token>) behind [Ändern] and Admin uploads: one card per Event,
// yellow = check, red = missing, and Publish stays disabled while a ticked Event misses something.
// Variant C of prototypes/organizer-confirmation-prototype.html.

type Submission = Held & {
  extraction: string;
  status: string;
  source: "whatsapp" | "admin" | "web";
  confirm_token: string;
  whatsapp_number: string;
  first_name: string | null;
  display_name: string;
};

export const confirmPage = new Hono<{ Bindings: Env }>();

confirmPage.get("/:token", async (c) => {
  const s = await load(c.env.DB, c.req.param("token"));
  if (!s) return c.notFound();
  if (s.status !== "pending") return c.html(<AlreadyDone />);
  const today = berlinDate(new Date());
  const extraction = JSON.parse(s.extraction) as Extraction;
  const events = extraction.events;
  // A past Event can't be fixed on the page, and one left out in the chat stays out, so both start unticked.
  const include = events.map((e) => !e.dropped && !(e.start_date && e.start_date < today));
  const notes = await cardNotes(c.env, s, events);
  // Keeps what the geocoder found, so the next visit and the publish don't ask again.
  await c.env.DB.prepare("UPDATE submission SET extraction = ? WHERE id = ?").bind(JSON.stringify(extraction), s.id).run();
  return c.html(<ConfirmPage s={s} events={events} include={include} today={today} notes={notes} />);
});

confirmPage.get("/:token/flyer", async (c) => {
  const s = await load(c.env.DB, c.req.param("token"));
  const object = s && (await c.env.FLYERS.get(s.flyer_key));
  if (!object) return c.notFound();
  return c.body(object.body, 200, { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private" });
});

confirmPage.post("/:token", async (c) => {
  const s = await load(c.env.DB, c.req.param("token"));
  if (!s) return c.notFound();
  if (s.status !== "pending") return c.html(<AlreadyDone />, 409);

  const form = await c.req.formData();
  const original = (JSON.parse(s.extraction) as Extraction).events;
  const events = original.map((e, i) => fromForm(form, i, e));
  const ticked = new Set(form.getAll("include").map(String));
  const include = events.map((_, i) => ticked.has(String(i)));
  const today = berlinDate(new Date());
  if (blocked(events, include, today)) {
    return c.html(<ConfirmPage s={s} events={events} include={include} today={today} notes={await cardNotes(c.env, s, events)} />, 422);
  }

  // A new Venue gets the coordinates of what the page showed, or of the address typed in since.
  for (const e of events) if (venueQuery(e) && !(await findVenue(c.env.DB, e))) await guessVenue(c.env, e);
  const ready = events.filter((_, i) => include[i]);
  const skipped = events.filter((_, i) => !include[i]);
  const result = await publishSubmission(c.env, s, ready, skipped);
  if (!result) return c.html(<AlreadyDone />, 409);
  if (s.source === "whatsapp") {
    // Outside the 24-hour window this fails; the page shows the same links anyway.
    await sendText(c.env, s.whatsapp_number, result.text).catch((err) => console.error("confirm page reply failed", err));
  }
  return c.html(<Done env={c.env} s={s} published={result.published} skipped={skipped} />);
});

async function load(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT s.id, s.organizer_id, s.flyer_key, s.received_on, s.extraction, s.status, s.source, s.confirm_token,
              o.whatsapp_number, o.first_name, o.display_name
       FROM submission s JOIN organizer o ON o.id = s.organizer_id WHERE s.confirm_token = ?`,
    )
    .bind(token)
    .first<Submission>();
}

type Notes = { warnings: string[]; venue?: string };

// Per card: a repost's update, likely duplicates, and for a new Venue what the geocoder found.
async function cardNotes(env: Env, s: Submission, events: ExtractedEvent[]): Promise<Notes[]> {
  return Promise.all(
    events.map(async (e) => {
      const warnings = await duplicatesOfExtracted(env.DB, e, s.flyer_key);
      if (e.update_of) warnings.unshift("Ersetzt dein bestehendes Event, der alte Link gilt weiter.");
      if (!venueQuery(e) || (await findVenue(env.DB, e))) return { warnings };
      const place = await guessVenue(env, e);
      const venue = place ? `Neuer Ort, auf der Karte gefunden: ${place.label}` : "Neuer Ort, auf der Karte nicht gefunden – bitte die Adresse prüfen.";
      return { warnings, venue };
    }),
  );
}

const blocked = (events: ExtractedEvent[], include: boolean[], today: string) =>
  !include.some(Boolean) || events.some((e, i) => include[i] && Object.keys(missing(e, today)).length > 0);

// What the model or the code checks found uncertain and the chat hasn't settled, by field.
function uncertain(e: ExtractedEvent, receivedOn: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of uncertainFields(e, receivedOn)) out.set(f, "bitte prüfen");
  // Same hint as the chat's "Flyer vom letzten Jahr?", but here the Organizer can fix the date.
  if (e.uncertain_fields.includes("start_date") && e.start_date > addDays(receivedOn, 183)) {
    out.set("start_date", "fast ein Jahr entfernt – stimmt das Jahr?");
  }
  return out;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const publishLabel = (n: number) => (n === 1 ? "1 Event veröffentlichen" : `${n} Events veröffentlichen`);

function ConfirmPage(props: { s: Submission; events: ExtractedEvent[]; include: boolean[]; today: string; notes: Notes[] }) {
  const { s, events, include, today } = props;
  const isBlocked = blocked(events, include, today);
  return (
    <Layout title="Events prüfen – DanceCalendar" head={<style>{CARD_CSS}</style>}>
      <h1>Events prüfen</h1>
      <img class="flyer" src={`/c/${s.confirm_token}/flyer`} alt="Flyer" />
      <p>
        {s.source !== "admin" && s.first_name ? `Hallo ${s.first_name}! ` : ""}
        Das habe ich auf dem Flyer erkannt. <span class="unc-key">Gelb</span> = bitte prüfen, <span class="miss-key">rot</span> = fehlt.
        Wird veröffentlicht als <strong>{s.display_name}</strong>.
      </p>
      <form id="confirm" method="post" data-today={today}>
        {events.map((e, i) => (
          <Card i={i} e={e} include={include[i]} red={missing(e, today)} yellow={uncertain(e, s.received_on)} warnings={props.notes[i].warnings} venue={props.notes[i].venue} />
        ))}
        <button name="publish" type="submit" class="publish" disabled={isBlocked}>
          {publishLabel(include.filter(Boolean).length)}
        </button>
        <p class="hint" hidden={!isBlocked}>
          Rote Felder füllen oder das Event abwählen.
        </p>
      </form>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </Layout>
  );
}

function Done(props: { env: Env; s: Submission; published: Published[]; skipped: ExtractedEvent[] }) {
  return (
    <Layout title="Ist online – DanceCalendar">
      <h1>✅ Ist online!</h1>
      <ul>
        {props.published.map((p) => (
          <li>
            <strong>{p.title}</strong> – {formatDate(p.startsAt.slice(0, 10), props.s.received_on)}
            <br />
            Bearbeiten: <a href={editLink(props.env, p)} style="overflow-wrap: anywhere">{editLink(props.env, p)}</a>
          </li>
        ))}
      </ul>
      {props.skipped.length > 0 && <p>Nicht eingetragen: {props.skipped.map((e) => e.title).join(", ")}</p>}
      <p>
        Die Links sind privat – nicht weiterleiten.
        {props.s.source === "whatsapp" ? " Du bekommst sie auch per WhatsApp." : ""}
      </p>
      <p>
        <a href="/">Zum Kalender</a>
      </p>
    </Layout>
  );
}

function AlreadyDone() {
  return (
    <Layout title="Erledigt – DanceCalendar">
      <h1>Dieser Flyer ist schon erledigt.</h1>
      <p>
        <a href="/">Zum Kalender</a>
      </p>
    </Layout>
  );
}

// Keeps the Publish button in step with the ticks and the required fields; the server checks again.
const SCRIPT = `(() => {
  const form = document.getElementById("confirm"), today = form.dataset.today;
  const button = form.querySelector("[name=publish]"), hint = form.querySelector(".hint");
  const check = () => {
    let live = 0, blocked = false;
    for (const card of form.querySelectorAll(".card")) {
      const on = card.querySelector("[name=include]").checked;
      card.classList.toggle("dropped", !on);
      if (on) live++;
      for (const input of card.querySelectorAll("[data-required]")) {
        const missing = !input.value.trim() || (input.type === "date" && input.value < today);
        input.classList.toggle("miss", missing);
        if (on && missing) blocked = true;
      }
    }
    button.disabled = blocked || live === 0;
    hint.hidden = !button.disabled;
    button.textContent = live === 1 ? "1 Event veröffentlichen" : live + " Events veröffentlichen";
  };
  form.addEventListener("input", check);
  form.addEventListener("change", check);
})();`;
