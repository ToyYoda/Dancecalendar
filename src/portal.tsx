import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomToken } from "./publish";
import { ruleWords, type Rule } from "./series";
import { BOT, BOT_URL, SitePage } from "./site";
import { queueUpload, waitForUpload } from "./upload";
import { berlinDate } from "./whatsapp/bot";
import {
  checkDigits,
  endSession,
  finishTelegramLogin,
  LOGIN_MINUTES,
  sessionAddress,
  startSession,
  startTelegramLogin,
  telegramLoginState,
} from "./web-login";

// The Organizer area at /veranstalter: what the bot does, on a website. Log in with Telegram (the bot
// asks "Warst du das?") or Google, then see all of one's Events, Series and Flyers waiting to be checked
// in one place, open each one's edit page, and add a Flyer, as one's own Event or as a Tip. Someone the
// bot doesn't know yet signs up here with the same form as the bot's /a/<token> link.
// Email login needs a domain to send from and is not offered yet.

type C = Context<{ Bindings: Env }>;
export const portal = new Hono<{ Bindings: Env }>();

type Organizer = { id: number; display_name: string; first_name: string | null; blocked_at: string | null };

const organizerOf = (db: D1Database, address: string) =>
  db.prepare("SELECT id, display_name, first_name, blocked_at FROM organizer WHERE whatsapp_number = ?").bind(address).first<Organizer>();

const google = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

portal.get("/", async (c) => {
  const address = await sessionAddress(c);
  if (!address) return c.html(<LoginPage google={google(c.env)} expired={c.req.query("abgelaufen") !== undefined} />);
  const o = await organizerOf(c.env.DB, address);
  if (!o) return c.html(<SignUp names={await displayNames(c.env.DB)} address={address} />);
  if (o.blocked_at) return c.html(<Blocked />);
  return c.html(<Dashboard o={o} address={address} data={await dashboard(c.env.DB, o.id)} google={google(c.env)} />);
});

// ---- Telegram ----

portal.post("/login/telegram", async (c) => c.redirect(`/veranstalter/login/telegram?c=${await startTelegramLogin(c)}`, 303));

portal.get("/login/telegram", async (c) => {
  const code = c.req.query("c") ?? "";
  const login = await telegramLoginState(c, code);
  if (login.state === "wait") return c.html(<TelegramWait code={code} digits={await checkDigits(code)} />);
  if (login.state !== "ok") return c.redirect("/veranstalter?abgelaufen", 303);

  // Logged in with Google before: that account now logs in as this Telegram chat too.
  const before = await sessionAddress(c);
  if (before?.startsWith("web:") && before !== login.address) await joinAddresses(c.env.DB, before, login.address);
  await endSession(c);
  await finishTelegramLogin(c, code);
  await startSession(c, login.address);
  return c.redirect("/veranstalter", 303);
});

portal.get("/login/telegram/status", async (c) => c.json({ state: (await telegramLoginState(c, c.req.query("c") ?? "")).state }));

// ---- Google (OpenID Connect, authorization code flow) ----

const OAUTH_COOKIE = "dc_oauth";
const redirectUri = (c: C) => `${new URL(c.req.url).origin}/veranstalter/login/google/callback`;

portal.get("/login/google", (c) => {
  if (!google(c.env)) return c.notFound();
  const state = randomToken();
  setCookie(c, OAUTH_COOKIE, state, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/veranstalter", maxAge: 600 });
  const q = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(c),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
});

portal.get("/login/google/callback", async (c) => {
  if (!google(c.env)) return c.notFound();
  const state = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: "/veranstalter" });
  const code = c.req.query("code");
  if (!state || state !== c.req.query("state") || !code) return c.redirect("/veranstalter?abgelaufen", 303);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c),
      grant_type: "authorization_code",
    }),
  });
  const token = (await res.json().catch(() => null)) as { id_token?: string } | null;
  // The ID token came straight from Google over TLS, so its claims need no signature check.
  const claims = token?.id_token ? decodeJwt(token.id_token) : null;
  const ok = claims && claims.aud === c.env.GOOGLE_CLIENT_ID && ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) && claims.sub;
  if (!ok) {
    console.error("Google login failed", res.status);
    return c.redirect("/veranstalter?abgelaufen", 303);
  }

  const known = await c.env.DB.prepare("SELECT address FROM web_login WHERE provider = 'google' AND subject = ?").bind(String(claims.sub)).first<{ address: string }>();
  // Logged in already (with Telegram): Google is added to that account.
  const address = known?.address ?? (await sessionAddress(c)) ?? `web:${randomToken()}`;
  await c.env.DB.prepare(
    `INSERT INTO web_login (provider, subject, address, email) VALUES ('google', ?, ?, ?)
     ON CONFLICT (provider, subject) DO UPDATE SET email = excluded.email`,
  )
    .bind(String(claims.sub), address, claims.email_verified ? String(claims.email ?? "") : null)
    .run();
  await endSession(c);
  await startSession(c, address);
  return c.redirect("/veranstalter", 303);
});

function decodeJwt(jwt: string): Record<string, any> | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (ch) => ch.charCodeAt(0))));
  } catch {
    return null;
  }
}

// A Google-only account that logs in with Telegram becomes that Telegram chat: its Google login and, if
// the chat has no Organizer yet, its Organizer move over.
async function joinAddresses(db: D1Database, from: string, to: string) {
  await db.prepare("UPDATE web_login SET address = ? WHERE address = ?").bind(to, from).run();
  if (!(await organizerOf(db, to))) await db.prepare("UPDATE organizer SET whatsapp_number = ? WHERE whatsapp_number = ?").bind(to, from).run();
}

portal.post("/logout", async (c) => {
  await endSession(c);
  return c.redirect("/veranstalter", 303);
});

// ---- Signing up ----

portal.post("/anmelden", async (c) => {
  const address = await sessionAddress(c);
  if (!address) return c.redirect("/veranstalter", 303);
  const form = await c.req.formData();
  const typed = String(form.get("display_name") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const firstName = String(form.get("first_name") ?? "").trim().slice(0, 60);
  const names = await displayNames(c.env.DB);
  if (!typed || !firstName || form.get("terms") !== "on") {
    return c.html(<SignUp names={names} address={address} displayName={typed} firstName={firstName} error="Bitte Name, Vorname und das Häkchen ausfüllen." />, 422);
  }
  // Typing an existing Display name joins it, in its existing spelling (as in src/application.tsx).
  const displayName = names.find((n) => n.toLowerCase() === typed.toLowerCase()) ?? typed;
  await c.env.DB.prepare(
    "INSERT INTO organizer (whatsapp_number, display_name, first_name) VALUES (?, ?, ?) ON CONFLICT (whatsapp_number) DO NOTHING",
  )
    .bind(address, displayName, firstName)
    .run();
  return c.redirect("/veranstalter?willkommen", 303);
});

async function displayNames(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT display_name FROM organizer WHERE blocked_at IS NULL ORDER BY display_name")
    .all<{ display_name: string }>();
  return results.map((r) => r.display_name);
}

// ---- Adding a Flyer ----

portal.post("/flyer", async (c) => {
  const address = await sessionAddress(c);
  const o = address && (await organizerOf(c.env.DB, address));
  if (!o || o.blocked_at) return c.redirect("/veranstalter", 303);
  const body = await c.req.parseBody();
  const tip = body.kind === "tip";
  const token = await queueUpload(c.env, body.flyer, tip ? null : o.id, tip ? "tip" : "web");
  if (!token) return c.html(<Dashboard o={o} address={address} data={await dashboard(c.env.DB, o.id)} google={google(c.env)} error />, 400);
  if (tip) return c.html(<TipThanks />);
  return c.redirect(`/veranstalter/flyer/${token}`, 303);
});

portal.get("/flyer/:token", async (c) => {
  const address = await sessionAddress(c);
  const o = address && (await organizerOf(c.env.DB, address));
  if (!o || o.blocked_at) return c.redirect("/veranstalter", 303);
  return waitForUpload(c, c.req.param("token"), o.id, "/veranstalter#neu");
});

// ---- What the dashboard shows ----

type EventRow = { id: number; title: string; starts_at: string; cancelled: number; flyer_key: string | null; edit_token: string | null; series_token: string | null; venue: string };
type SeriesRow = { edit_token: string; rule: string; title: string | null; next: string | null };
type Waiting = { confirm_token: string; received_on: string; extraction: string };

async function dashboard(db: D1Database, organizerId: number) {
  const today = berlinDate(new Date());
  const events = (order: string, where: string, limit: number) =>
    db
      .prepare(
        `SELECT e.id, e.title, e.starts_at, e.cancelled, e.flyer_key, e.edit_token, s.edit_token AS series_token, v.name AS venue
         FROM event e JOIN venue v ON v.id = e.venue_id LEFT JOIN series s ON s.id = e.series_id
         WHERE e.organizer_id = ? AND ${where} ORDER BY e.starts_at ${order} LIMIT ${limit}`,
      )
      .bind(organizerId, today)
      .all<EventRow>();
  const [upcoming, past, series, waiting] = await Promise.all([
    events("ASC", "e.starts_at >= ?", 60),
    events("DESC", "e.starts_at < ?", 20),
    db
      .prepare(
        `SELECT s.edit_token, s.rule,
                (SELECT title FROM event WHERE series_id = s.id ORDER BY starts_at DESC LIMIT 1) AS title,
                (SELECT MIN(starts_at) FROM event WHERE series_id = s.id AND starts_at >= ? AND cancelled = 0) AS next
         FROM series s WHERE s.organizer_id = ? AND s.ended_at IS NULL AND s.edit_token IS NOT NULL ORDER BY next`,
      )
      .bind(today, organizerId)
      .all<SeriesRow>(),
    db
      .prepare(
        `SELECT confirm_token, received_on, extraction FROM submission
         WHERE organizer_id = ? AND status = 'pending' AND confirm_token IS NOT NULL ORDER BY created_at DESC LIMIT 20`,
      )
      .bind(organizerId)
      .all<Waiting>(),
  ]);
  // Every Event gets the private edit link the bot sends; the oldest ones may not have one yet.
  for (const e of [...upcoming.results, ...past.results]) {
    if (e.edit_token) continue;
    e.edit_token = randomToken();
    await db.prepare("UPDATE event SET edit_token = ? WHERE id = ? AND edit_token IS NULL").bind(e.edit_token, e.id).run();
  }
  return { upcoming: upcoming.results, past: past.results, series: series.results, waiting: waiting.results };
}

// ---- Pages ----

const Nav = (props: { loggedIn?: boolean }) => (
  <>
    <a class="about" href="/">
      Zum Kalender
    </a>
    {props.loggedIn && (
      <form method="post" action="/veranstalter/logout" style="margin:0">
        <button class="btn" style="height:34px;padding:0 14px;font-size:14px" type="submit">
          Abmelden
        </button>
      </form>
    )}
  </>
);

const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.4 1.9 11.9c-1-.3-1-1 .2-1.5l18.4-7.1c.9-.3 1.6.2 1.4 1.3z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

function LoginPage(props: { google: boolean; expired?: boolean }) {
  return (
    <SitePage title="Für Veranstalter" nav={<Nav />}>
      <h1>Deine Events auf einen Blick</h1>
      <p class="lead">
        Hier siehst du alle deiner Events, bearbeitest sie direkt und trägst neue Flyer ein. Genau wie mit dem Bot, nur mit mehr Überblick.
      </p>
      {props.expired && <p class="note warn">Die Anmeldung ist abgelaufen oder wurde abgebrochen. Versuch es einfach nochmal.</p>}
      <div class="panel">
        <h2 style="margin-top:0">Anmelden</h2>
        <form method="post" action="/veranstalter/login/telegram">
          <button class="btn solid wide tg" type="submit">
            <TelegramIcon /> Mit Telegram anmelden
          </button>
        </form>
        <p class="hint">Du bestätigst die Anmeldung mit einem Tipp im Chat mit @{BOT}. Ein Passwort brauchst du nicht.</p>
        {props.google && (
          <>
            <div class="or">oder</div>
            <a class="btn wide" href="/veranstalter/login/google">
              <GoogleIcon /> Mit Google anmelden
            </a>
          </>
        )}
      </div>
      <h2>Lieber im Chat?</h2>
      <p>
        Schick deinen Flyer einfach an <a class="about" href={BOT_URL}>@{BOT}</a> auf Telegram. Der Bot liest ihn aus, du prüfst kurz, fertig.
      </p>
    </SitePage>
  );
}

function TelegramWait(props: { code: string; digits: string }) {
  const link = `https://t.me/${BOT}?start=login-${props.code}`;
  const poll = `(function(){var u="/veranstalter/login/telegram/status?c=${props.code}";function t(){fetch(u,{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(j){if(j.state!=="wait")location.reload();else setTimeout(t,2000)}).catch(function(){setTimeout(t,4000)})}setTimeout(t,2000)})();`;
  return (
    <SitePage title="Mit Telegram anmelden" nav={<Nav />}>
      <h1>In Telegram bestätigen</h1>
      <div class="panel stack">
        <p>
          <b>1.</b> Öffne den Chat mit @{BOT} und tippe auf <b>Starten</b>.
        </p>
        <a class="btn solid wide tg" href={link} target="_blank" rel="noopener">
          <TelegramIcon /> Telegram öffnen
        </a>
        <p>
          <b>2.</b> Tippe dort auf <b>„Ja, das war ich“</b>, wenn derselbe Prüfcode steht:
        </p>
        <p class="code" aria-label={`Prüfcode ${props.digits.split("").join(" ")}`}>
          {props.digits}
        </p>
        <p style="display:flex;gap:10px;align-items:center" class="hint">
          <span class="spin" aria-hidden="true" /> Diese Seite geht danach von selbst weiter.
        </p>
      </div>
      <p class="hint">
        Der Link gilt {LOGIN_MINUTES} Minuten und nur in diesem Browser. Klappt es nicht?{" "}
        <a class="about" href={`/veranstalter/login/telegram?c=${props.code}`}>
          Seite neu laden
        </a>{" "}
        oder{" "}
        <a class="about" href="/veranstalter">
          neu starten
        </a>
        .
      </p>
      <script dangerouslySetInnerHTML={{ __html: poll }} />
    </SitePage>
  );
}

function SignUp(props: { names: string[]; address: string; displayName?: string; firstName?: string; error?: string }) {
  return (
    <SitePage title="Als Veranstalter*in anmelden" nav={<Nav loggedIn />}>
      <h1>Willkommen bei DanceCalendar</h1>
      <p class="lead">Einmal kurz, dann trägst du deine Events selbst ein, hier oder über den Bot.</p>
      {props.error && <p class="note bad">{props.error}</p>}
      <form method="post" action="/veranstalter/anmelden" class="panel">
        <label for="display_name">Unter welchem Namen sollen deine Events erscheinen?</label>
        <input id="display_name" name="display_name" list="names" value={props.displayName ?? ""} required maxlength={60} autocomplete="organization" />
        <p class="hint">Öffentlich, z. B. „Salsa Kassel“. Gibt es den Namen schon, trittst du ihm bei.</p>
        <datalist id="names">
          {props.names.map((n) => (
            <option value={n} />
          ))}
        </datalist>
        <label for="first_name">Dein Vorname</label>
        <input id="first_name" name="first_name" value={props.firstName ?? ""} required maxlength={60} autocomplete="given-name" />
        <p class="hint">Nicht öffentlich, nur für den Admin.</p>
        <label class="check">
          <input type="checkbox" name="terms" required />
          <span>
            Ich akzeptiere die{" "}
            <a class="about" href="/nutzungsbedingungen" target="_blank">
              Nutzungsbedingungen
            </a>{" "}
            und erlaube DanceCalendar, meine Flyer und Events öffentlich zu zeigen. Ich habe die Rechte daran. Wie wir mit deinen Daten umgehen, steht im{" "}
            <a class="about" href="/datenschutz" target="_blank">
              Datenschutz
            </a>
            .
          </span>
        </label>
        <button class="btn solid wide" type="submit">
          Anmelden
        </button>
      </form>
      {props.address.startsWith("web:") && (
        <p class="hint">
          Schon über Telegram dabei? Dann{" "}
          <a class="about" href="/veranstalter/telegram-verbinden">
            melde dich mit Telegram an
          </a>
          , statt dich neu anzumelden.
        </p>
      )}
    </SitePage>
  );
}

// Logged in with Google only, but already known to the bot: Telegram joins the two.
portal.get("/telegram-verbinden", (c) =>
  c.html(
    <SitePage title="Telegram verbinden" nav={<Nav loggedIn />}>
      <h1>Mit Telegram verbinden</h1>
      <p class="lead">Melde dich einmal mit Telegram an. Danach führt auch Google zu deinen Events.</p>
      <form method="post" action="/veranstalter/login/telegram">
        <button class="btn solid wide tg" type="submit">
          <TelegramIcon /> Mit Telegram anmelden
        </button>
      </form>
    </SitePage>,
  ),
);

function Blocked() {
  return (
    <SitePage title="Gesperrt" nav={<Nav loggedIn />}>
      <h1>Dein Zugang ist gesperrt</h1>
      <p class="lead">Deine Events sind nicht mehr im Kalender. Wenn du meinst, das ist ein Fehler, schreib uns über die Kontaktdaten im Impressum.</p>
    </SitePage>
  );
}

function TipThanks() {
  return (
    <SitePage title="Danke für den Tipp" nav={<Nav loggedIn />}>
      <h1>Danke für den Tipp!</h1>
      <p class="lead">Der Admin schaut sich den Flyer an und trägt das Event ein. Du musst nichts weiter tun.</p>
      <p class="row2">
        <a class="btn solid" href="/veranstalter#neu">
          Noch einen Flyer
        </a>
        <a class="btn" href="/veranstalter">
          Zu deinen Events
        </a>
      </p>
    </SitePage>
  );
}

const WEEKDAY = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const MONTH = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
function when(startsAt: string): string {
  const d = new Date(`${startsAt.slice(0, 10)}T12:00:00Z`);
  const time = startsAt.slice(11, 16);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTH[d.getUTCMonth()]}${time ? ` · ${time}` : ""}`;
}

const Flyer = (props: { flyerKey: string | null }) =>
  props.flyerKey ? <img src={`/${props.flyerKey}`} alt="" width="72" height="96" loading="lazy" decoding="async" /> : <span class="none" />;

function EventList(props: { events: EventRow[] }) {
  return (
    <ul class="evs">
      {props.events.map((e) => (
        <li class={e.cancelled ? "ev off" : "ev"}>
          <Flyer flyerKey={e.flyer_key} />
          <div>
            <div class="when">{when(e.starts_at)}</div>
            <h3>
              {e.title}
              {e.cancelled ? <span class="tag">abgesagt</span> : null}
            </h3>
            <div class="where">{e.venue}</div>
            <div class="acts">
              <a class="btn" href={`/e/${e.edit_token}`}>
                Bearbeiten
              </a>
              {e.series_token && (
                <a class="btn" href={`/s/${e.series_token}`}>
                  Serie
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}


function Dashboard(props: { o: Organizer; address: string; data: Awaited<ReturnType<typeof dashboard>>; google: boolean; error?: boolean }) {
  const { o, data } = props;
  const waiting = data.waiting.map((w) => {
    const x = JSON.parse(w.extraction) as { events?: { title?: string; start_date?: string }[] };
    return { token: w.confirm_token, title: x.events?.[0]?.title || "Flyer", date: x.events?.[0]?.start_date };
  });
  return (
    <SitePage title="Deine Events" nav={<Nav loggedIn />}>
      <h1>Hallo{o.first_name ? ` ${o.first_name}` : ""}!</h1>
      <p class="lead">
        Deine Events erscheinen als <b>{o.display_name}</b>.
      </p>

      {waiting.length > 0 && (
        <section class="panel" style="box-shadow:var(--shadow), 0 0 0 2px var(--warm-tint)">
          <h2 style="margin-top:0">Wartet auf deine Prüfung</h2>
          <ul class="evs">
            {waiting.map((w) => (
              <li class="ev" style="grid-template-columns:minmax(0,1fr) auto">
                <div>
                  {w.date && <div class="when">{when(w.date)}</div>}
                  <h3>{w.title}</h3>
                </div>
                <a class="btn solid" href={`/c/${w.token}`}>
                  Prüfen
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="panel" id="neu">
        <h2 style="margin-top:0">Neues Event eintragen</h2>
        {props.error && <p class="note bad">Bitte ein Bild wählen (JPEG, PNG oder WebP).</p>}
        <form method="post" action="/veranstalter/flyer" enctype="multipart/form-data" class="stack">
          <label class="drop">
            <input type="file" name="flyer" accept="image/jpeg,image/png,image/webp" required />
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <b>Flyer wählen</b>
            <small>Foto oder Screenshot. Den Rest liest DanceCalendar heraus.</small>
          </label>
          <div class="choices" role="radiogroup" aria-label="Wessen Event?">
            <label class="choice">
              <input type="radio" name="kind" value="own" checked />
              <span>
                Mein Event
                <small>Erscheint als {o.display_name}. Du prüfst alles, bevor es online geht.</small>
              </span>
            </label>
            <label class="choice">
              <input type="radio" name="kind" value="tip" />
              <span>
                Ein Tipp
                <small>Ein Event von jemand anderem. Der Admin prüft und trägt es ein.</small>
              </span>
            </label>
          </div>
          <button class="btn solid wide" type="submit">
            Hochladen und auslesen
          </button>
        </form>
        <p class="hint">
          Unterwegs geht es auch im Chat: Flyer an <a class="about" href={BOT_URL}>@{BOT}</a> schicken.
        </p>
      </section>

      <h2>Kommende Events</h2>
      {data.upcoming.length ? (
        <div class="panel">
          <EventList events={data.upcoming} />
        </div>
      ) : (
        <p class="hint">Noch keine kommenden Events. Lade oben einen Flyer hoch.</p>
      )}

      {data.series.length > 0 && (
        <>
          <h2>Serien</h2>
          <div class="panel">
            <ul class="evs">
              {data.series.map((s) => (
                <li class="ev" style="grid-template-columns:minmax(0,1fr) auto">
                  <div>
                    <h3>{s.title ?? "Serie"}</h3>
                    <div class="where">
                      {ruleWords(JSON.parse(s.rule) as Rule)}
                      {s.next ? ` · nächster Termin ${when(s.next)}` : ""}
                    </div>
                  </div>
                  <a class="btn" href={`/s/${s.edit_token}`}>
                    Bearbeiten
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {data.past.length > 0 && (
        <details class="more">
          <summary>Vergangene Events ({data.past.length})</summary>
          <div class="panel">
            <EventList events={data.past} />
          </div>
        </details>
      )}

      <p class="hint" style="margin-top:28px">
        {props.address.startsWith("tg:") ? "Angemeldet mit Telegram." : "Angemeldet mit Google."}{" "}
        {props.address.startsWith("web:") && (
          <a class="about" href="/veranstalter/telegram-verbinden">
            Telegram verbinden
          </a>
        )}
        {props.address.startsWith("tg:") && props.google && (
          <a class="about" href="/veranstalter/login/google">
            Google zusätzlich verbinden
          </a>
        )}
      </p>
    </SitePage>
  );
}
