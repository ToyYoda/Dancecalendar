import { Hono } from "hono";
import { duplicatesOfExtracted } from "./duplicates";
import { Card, CARD_CSS, fromForm, missing, RuleSelect } from "./event-card";
import type { ExtractedEvent, Extraction } from "./extraction/extract";
import { Layout } from "./layout";
import { findVenue, publishSubmission, venueQuery, type Entry, type Held } from "./publish";
import { heldRule, seriesLeads } from "./series";
import { berlinDate } from "./whatsapp/bot";
import { sendText } from "./whatsapp/graph";
import { guessVenue } from "./whatsapp/questions";
import { formatDate, uncertainFields } from "./whatsapp/summary";

// The private web confirm page (/c/<token>) behind [Ändern] and Admin uploads: one card per Event,
// yellow = check, red = missing, and Publish stays disabled while a ticked Event misses something.
// Variant C of prototypes/organizer-confirmation-prototype.html. Tips have no Organizer and open only
// in the Admin's review (src/tips.tsx), with the same cards.

export type Submission = Held & {
  extraction: string;
  status: string;
  source: "whatsapp" | "admin" | "web" | "tip";
  confirm_token: string;
  whatsapp_number: string | null;
  first_name: string | null;
  display_name: string | null;
};

export const confirmPage = new Hono<{ Bindings: Env }>();

confirmPage.get("/:token", async (c) => {
  const s = await loadSubmission(c.env.DB, c.req.param("token"));
  if (!s || s.source === "tip") return c.notFound();
  if (s.status !== "pending") return c.html(<AlreadyDone />);
  return c.html(<ConfirmPage {...await openCards(c.env, s)} />);
});

confirmPage.get("/:token/flyer", async (c) => {
  const s = await loadSubmission(c.env.DB, c.req.param("token"));
  if (!s || s.source === "tip") return c.notFound();
  return flyerOf(c.env, s);
});

confirmPage.post("/:token", async (c) => {
  const s = await loadSubmission(c.env.DB, c.req.param("token"));
  if (!s || s.source === "tip") return c.notFound();
  if (s.status !== "pending") return c.html(<AlreadyDone />, 409);

  const read = await readCards(c.env, s, await c.req.formData());
  if (read.blocked) return c.html(<ConfirmPage {...read.page} />, 422);
  const result = await publishSubmission(c.env, s, read.ready, read.skipped);
  if (!result) return c.html(<AlreadyDone />, 409);
  if (s.source === "whatsapp" && s.whatsapp_number) {
    // Outside the 24-hour window this fails; the page shows the same links anyway.
    await sendText(c.env, s.whatsapp_number, result.text).catch((err) => console.error("confirm page reply failed", err));
  }
  return c.html(<Done s={s} entries={result.entries} skipped={read.skipped} />);
});

export async function loadSubmission(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT s.id, s.organizer_id, s.flyer_key, s.received_on, s.extraction, s.status, s.source, s.confirm_token,
              o.whatsapp_number, o.first_name, o.display_name
       FROM submission s LEFT JOIN organizer o ON o.id = s.organizer_id WHERE s.confirm_token = ?`,
    )
    .bind(token)
    .first<Submission>();
}

export async function flyerOf(env: Env, s: Submission) {
  const object = await env.FLYERS.get(s.flyer_key);
  if (!object) return new Response("Not Found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private" } });
}

type PageProps = { s: Submission; events: ExtractedEvent[]; include: boolean[]; today: string; notes: Notes[] };

// The cards as the Flyer was read and answered in the chat.
export async function openCards(env: Env, s: Submission): Promise<PageProps> {
  const today = berlinDate(new Date());
  const extraction = JSON.parse(s.extraction) as Extraction;
  const events = extraction.events;
  // A past Event can't be fixed on the page, and one left out in the chat stays out, so both start unticked.
  const include = events.map((e) => !e.dropped && !(e.start_date && e.start_date < today));
  const notes = await cardNotes(env, s, events);
  // Keeps what the geocoder found, so the next visit and the publish don't ask again.
  await env.DB.prepare("UPDATE submission SET extraction = ? WHERE id = ?").bind(JSON.stringify(extraction), s.id).run();
  return { s, events, include, today, notes };
}

// The submitted cards: the page again while a ticked Event misses something, otherwise what to publish.
export async function readCards(env: Env, s: Submission, form: FormData) {
  const original = (JSON.parse(s.extraction) as Extraction).events;
  const events = original.map((e, i) => fromForm(form, i, e));
  const ticked = new Set(form.getAll("include").map(String));
  const include = events.map((_, i) => ticked.has(String(i)));
  const today = berlinDate(new Date());
  const page = async (): Promise<PageProps> => ({ s, events, include, today, notes: await cardNotes(env, s, events) });
  if (blocked(events, include, today)) return { blocked: true as const, page: await page() };

  // A new Venue gets the coordinates of what the page showed, or of the address typed in since.
  for (const e of events) if (venueQuery(e) && !(await findVenue(env.DB, e))) await guessVenue(env, e);
  return { blocked: false as const, page, ready: events.filter((_, i) => include[i]), skipped: events.filter((_, i) => !include[i]) };
}

type Notes = { warnings: string[]; venue?: string };

// Per card: a repost's update, a Tip Event it replaces, likely duplicates, and for a new Venue what the geocoder found.
async function cardNotes(env: Env, s: Submission, events: ExtractedEvent[]): Promise<Notes[]> {
  return Promise.all(
    events.map(async (e) => {
      const warnings = await duplicatesOfExtracted(env.DB, e, s.flyer_key, { except: e.replaces_tip });
      if (e.replaces_tip) {
        const tip = await env.DB.prepare("SELECT title FROM event WHERE id = ? AND is_tip = 1").bind(e.replaces_tip).first<{ title: string }>();
        if (tip) warnings.unshift(`Ersetzt den Community-Tipp „${tip.title}“, der dann gelöscht wird.`);
      }
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

const publishLabel = (n: number, verb: string) => (n === 1 ? `1 Event ${verb}` : `${n} Events ${verb}`);

// `tip`: the Admin's review of a Tip, with the name its Events are shown under and [Ablehnen].
export function ConfirmPage(props: PageProps & { tip?: { shownAs: string; error?: string } }) {
  const { s, events, include, today, tip } = props;
  const isBlocked = blocked(events, include, today);
  const verb = tip ? "freigeben" : "veröffentlichen";
  return (
    <Layout title={`${tip ? "Tipp" : "Events"} prüfen – DanceCalendar`} head={<style>{CARD_CSS}</style>}>
      <h1>{tip ? "Tipp prüfen" : "Events prüfen"}</h1>
      <img class="flyer" src={tip ? `/admin/tips/${s.confirm_token}/flyer` : `/c/${s.confirm_token}/flyer`} alt="Flyer" />
      <p>
        {s.source !== "admin" && s.first_name ? `Hallo ${s.first_name}! ` : ""}
        Das habe ich auf dem Flyer erkannt. <span class="unc-key">Gelb</span> = bitte prüfen, <span class="miss-key">rot</span> = fehlt.
        {tip ? " Wird als „von der Community hinzugefügt“ gezeigt." : <> Wird veröffentlicht als <strong>{s.display_name}</strong>.</>}
      </p>
      <form id="confirm" method="post" data-today={today}>
        {tip && (
          <p class="shown-as">
            {tip.error && <strong style="color:#a30000">{tip.error}<br /></strong>}
            <label>
              <strong>Gezeigt als</strong> (Name vom Flyer)
              <br />
              <input name="shown_as" value={tip.shownAs} required maxlength={60} />
            </label>
          </p>
        )}
        {events.map((e, i) => (
          <Card
            i={i}
            e={e}
            include={include[i]}
            red={missing(e, today)}
            yellow={uncertain(e, s.received_on)}
            warnings={props.notes[i].warnings}
            venue={props.notes[i].venue}
            series={<SeriesField events={events} i={i} />}
          />
        ))}
        <button name="publish" type="submit" class="publish" disabled={isBlocked} data-verb={verb}>
          {publishLabel(include.filter(Boolean).length, verb)}
        </button>
        <p class="hint" hidden={!isBlocked}>
          Rote Felder füllen oder das Event abwählen.
        </p>
        {tip && (
          <button type="submit" class="reject" formaction={`/admin/tips/${s.confirm_token}/reject`} formnovalidate>
            Ablehnen
          </button>
        )}
      </form>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </Layout>
  );
}

// The first Event of a Series chooses the rule; the Flyer's other dates of it follow.
function SeriesField(props: { events: ExtractedEvent[]; i: number }) {
  const e = props.events[props.i];
  if (e.update_of && e.update_series) return <p class="series">🔁 {e.series.is_series ? "verlängert deine Serie" : "ändert nur diesen Termin deiner Serie"}</p>;
  if (!e.series.is_series) return null;
  if (seriesLeads(props.events)[props.i] !== props.i) return <p class="series">🔁 gehört zur Serie oben</p>;
  const rule = heldRule(e);
  const unclear = !rule && e.series_rule === undefined;
  return <RuleSelect i={props.i} e={e} rule={rule} none="Nur dieser Termin" note={unclear ? "Wie oft? Bitte wählen – sonst nur dieser Termin." : undefined} />;
}

export function Done(props: { s: Submission; entries: Entry[]; skipped: ExtractedEvent[] }) {
  return (
    <Layout title="Ist online – DanceCalendar">
      <h1>✅ Ist online!</h1>
      <ul>
        {props.entries.map((p) => (
          <li>
            <strong>{p.title}</strong> – {p.when}
            {p.note}
            <br />
            {p.label}: <a href={p.link} style="overflow-wrap: anywhere">{p.link}</a>
          </li>
        ))}
      </ul>
      {props.skipped.length > 0 && <p>Nicht eingetragen: {props.skipped.map((e) => e.title).join(", ")}</p>}
      <p>
        Die Links sind privat – nicht weiterleiten.
        {props.s.source === "whatsapp" ? " Du bekommst sie auch per WhatsApp." : ""}
      </p>
      <p>{props.s.source === "tip" ? <a href="/admin/tips">Zu den Tipps</a> : <a href="/">Zum Kalender</a>}</p>
    </Layout>
  );
}

export function AlreadyDone() {
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
    button.textContent = (live === 1 ? "1 Event " : live + " Events ") + button.dataset.verb;
  };
  form.addEventListener("input", check);
  form.addEventListener("change", check);
})();`;
