import { Hono } from "hono";
import { Layout } from "./layout";
import { addDays, ruleWords, type Rule } from "./series";
import { berlinDate } from "./whatsapp/bot";

// The Dancer overview at "/": a Flyer feed paged by week (the default) and a month calendar with a day
// list (?view=cal), both under one row of filters kept in the URL, so a link shows the same view on
// any phone. No accounts, no cookies. Distances are measured from the Dancer's position (the browser is
// asked on a visit without one) or a place picked on the map at /karte; without either, every Event shows
// and no km. Decisions: .scratch/dance-calendar-mvp/issues/07-dancer-overview-prototype.md (variant D),
// 10-region-boundary.md, 23-dancer-overview.md and 33-distance-from-my-position.md.

type Lang = "de" | "en";

// URL parameters, all optional:
// c = "lat,lng" (without it: no distances, every Event), r = 10|25|50|100|all (default 50, only with c),
// styles = salsa,bachata,…, type = party|workshop|course|festival, view = cal, w = a week's Monday,
// d = the calendar's selected day, lang = en.
type Filters = { c: string; r: string; styles: string[]; type: string; view: string; w: string; d: string; lang: Lang; v: string };

const RADII = ["10", "25", "50", "100", "all"];
const DEFAULT_RADIUS = "50";
const STYLES: [string, string][] = [
  ["salsa", "Salsa"],
  ["bachata", "Bachata"],
  ["kizomba", "Kizomba"],
  ["urban_kiz", "Urban Kiz"],
  ["west_coast_swing", "West Coast Swing"],
];
const TYPES = ["party", "workshop", "course", "festival"] as const;

const T = {
  de: {
    all: "Alle", party: "Party", workshop: "Workshop", course: "Kurs", festival: "Festival",
    parties: "Partys", workshops: "Workshops", courses: "Kurse", festivals: "Festivals",
    anywhere: "überall", me: "Mein Standort", noGeo: "Standort nicht verfügbar", map: "Auf Karte wählen", here: "Ab hier",
    noPlace: "Alle Orte", hint: "Für Entfernungen: Standort freigeben oder einen Ort auf der Karte wählen.",
    pick: "Tippe auf die Karte, um den Ort zu wählen.", use: "Von hier messen",
    radius: "Umkreis", none: "Keine Events für diese Filter.", cancelled: "Abgesagt", tip: "von der Community hinzugefügt",
    reg: "Anmeldung nötig", intro: "Einsteigerkurs", level: "Level", price: "Eintritt", venue: "Ort", by: "Veranstaltet von",
    series: "Serie", link: "Link", styles: "Tanzstil", day: "Tag", feed: "Flyer", calendar: "Kalender", back: "Zurück",
    today: "Heute", sub: "Partnertanz in Kassel, Göttingen und drumherum",
  },
  en: {
    all: "All", party: "Party", workshop: "Workshop", course: "Course", festival: "Festival",
    parties: "Parties", workshops: "Workshops", courses: "Courses", festivals: "Festivals",
    anywhere: "anywhere", me: "My location", noGeo: "Location not available", map: "Pick on map", here: "From here",
    noPlace: "All places", hint: "For distances: allow your location or pick a place on the map.",
    pick: "Tap the map to pick the place.", use: "Measure from here",
    radius: "Radius", none: "No events for these filters.", cancelled: "Cancelled", tip: "added by the community",
    reg: "Registration required", intro: "Intro class", level: "Level", price: "Price", venue: "Venue", by: "Organized by",
    series: "Series", link: "Link", styles: "Style", day: "Day", feed: "Flyers", calendar: "Calendar", back: "Back",
    today: "Today", sub: "Partner dance in and around Kassel and Göttingen",
  },
} as const;
const PLURAL = { party: "parties", workshop: "workshops", course: "courses", festival: "festivals" } as const;

type Row = {
  id: number;
  title: string;
  type: "party" | "workshop" | "festival";
  styles: string;
  starts_at: string;
  ends_at: string | null;
  intro_class_at: string | null;
  level: string | null;
  price: string | null;
  link: string | null;
  description: string | null;
  cancelled: number;
  is_tip: number;
  flyer_key: string | null;
  posted_by: string | null;
  venue: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rule: string | null;
  registration_required: number | null;
};

type Shown = Row & { km: number | null };
type OnDay = { e: Shown; dayN?: number; dayOf?: number };

export const overview = new Hono<{ Bindings: Env }>();

overview.get("/", async (c) => {
  const f = filters(new URL(c.req.url).searchParams);
  const today = berlinDate(new Date());
  if (f.view === "cal") {
    const sel = isDate(f.d) ? f.d : today;
    const first = `${sel.slice(0, 7)}-01`;
    const gridStart = addDays(first, -((weekday(first) + 6) % 7));
    const days = range(gridStart, 42);
    const byDay = await eventsByDay(c.env.DB, f, days);
    return c.html(<CalendarPage f={f} today={today} sel={sel} first={first} byDay={byDay} />);
  }
  // Without a week in the URL: today and the next 7 days. With one: that Monday to Sunday.
  const monday = isDate(f.w) ? addDays(f.w, -((weekday(f.w) + 6) % 7)) : "";
  const days = monday ? range(monday, 7) : range(today, 8);
  const byDay = await eventsByDay(c.env.DB, f, days);
  return c.html(<FeedPage f={f} today={today} monday={monday} byDay={byDay} />);
});

overview.get("/events/:id", async (c) => {
  const f = filters(new URL(c.req.url).searchParams);
  const row = await c.env.DB.prepare(`${SELECT} WHERE e.id = ?`).bind(Number(c.req.param("id"))).first<Row>();
  if (!row) return c.notFound();
  return c.html(<DetailPage f={f} e={{ ...row, km: distance(row, f) }} />);
});

// The map to pick the place distances are measured from. MapLibre comes from this site (public/vendor);
// only this page loads tiles from OpenFreeMap, so a visitor's IP goes there only after choosing the map.
overview.get("/karte", (c) => {
  const f = filters(new URL(c.req.url).searchParams);
  return c.html(<MapPage f={f} />);
});

// Flyer images of published Events only: a held or discarded Flyer stays private. Keys are random and
// never change, so browsers may keep them for a year.
overview.get("/flyers/:name", async (c) => {
  const key = `flyers/${c.req.param("name")}`;
  const used = await c.env.DB.prepare("SELECT 1 FROM event WHERE flyer_key = ? LIMIT 1").bind(key).first();
  const object = used && (await c.env.FLYERS.get(key));
  if (!object) return c.notFound();
  return c.body(object.body, 200, {
    "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
  });
});

// ---- Filters ----

function filters(p: URLSearchParams): Filters {
  const list = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  const c = p.get("c") ?? "";
  const r = p.get("r") ?? "";
  return {
    c: coordinates(c) ? c : "",
    r: RADII.includes(r) ? r : "",
    styles: list("styles").filter((s) => STYLES.some(([k]) => k === s)),
    type: (TYPES as readonly string[]).includes(p.get("type") ?? "") ? p.get("type")! : "",
    view: p.get("view") === "cal" ? "cal" : "",
    w: p.get("w") ?? "",
    d: p.get("d") ?? "",
    lang: p.get("lang") === "en" ? "en" : "de",
    v: VARIANTS.some(([k]) => k === p.get("variant")) ? p.get("variant")! : "",
  };
}

// A link to the overview with some filters changed; defaults stay out of the URL.
function href(f: Filters, changes: Partial<Filters> = {}, path = "/"): string {
  const g = { ...f, ...changes };
  const p = new URLSearchParams();
  if (g.view) p.set("view", g.view);
  if (g.c) p.set("c", g.c);
  if (g.r && g.r !== DEFAULT_RADIUS) p.set("r", g.r);
  if (g.styles.length) p.set("styles", g.styles.join(","));
  if (g.type) p.set("type", g.type);
  if (g.view && g.d) p.set("d", g.d);
  if (!g.view && g.w) p.set("w", g.w);
  if (g.lang === "en") p.set("lang", "en");
  if (g.v) p.set("variant", g.v);
  const q = p.toString().replace(/%2C/g, ",");
  return q ? `${path}?${q}` : path;
}

function coordinates(c: string): { lat: number; lng: number } | null {
  const m = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(c);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

// Straight-line km from the chosen place; null without a place or when the Venue has no coordinates.
function distance(v: { lat: number | null; lng: number | null }, f: Filters): number | null {
  const from = coordinates(f.c);
  if (!from || v.lat === null || v.lng === null) return null;
  return haversine(from, { lat: v.lat, lng: v.lng });
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// A Venue without coordinates can't be placed, so its Events show wherever the Dancer looks.
// Style-less Events show only while no style is picked. The Workshop tab includes Parties with an Intro class.
function matches(e: Shown, f: Filters): boolean {
  const styles = JSON.parse(e.styles) as string[];
  if (f.styles.length && !styles.some((s) => f.styles.includes(s))) return false;
  if (f.type === "party" && e.type !== "party") return false;
  if (f.type === "workshop" && e.type !== "workshop" && !e.intro_class_at) return false;
  if (f.type === "course" && !isCourse(e)) return false;
  if (f.type === "festival" && e.type !== "festival") return false;
  const radius = f.r || DEFAULT_RADIUS;
  return !f.c || radius === "all" || e.km === null || e.km <= Number(radius);
}

const isCourse = (e: Row) => e.registration_required === 1;

// ---- Events ----

const SELECT = `SELECT e.id, e.title, e.type, e.styles, e.starts_at, e.ends_at, e.intro_class_at, e.level, e.price, e.link,
                       e.description, e.cancelled, e.is_tip, e.flyer_key, COALESCE(o.display_name, e.shown_as) AS posted_by,
                       v.name AS venue, v.address, v.lat, v.lng, s.rule, s.registration_required
                FROM event e JOIN venue v ON v.id = e.venue_id LEFT JOIN organizer o ON o.id = e.organizer_id
                LEFT JOIN series s ON s.id = e.series_id`;

// The matching Events of each day; a Festival shows on every day it runs.
async function eventsByDay(db: D1Database, f: Filters, days: string[]): Promise<Map<string, OnDay[]>> {
  const [from, to] = [days[0], addDays(days.at(-1)!, 1)];
  const { results } = await db
    .prepare(`${SELECT} WHERE e.starts_at < ? AND (e.starts_at >= ? OR (e.type = 'festival' AND e.ends_at >= ?)) ORDER BY e.starts_at`)
    .bind(to, from, from)
    .all<Row>();
  const byDay = new Map<string, OnDay[]>(days.map((d) => [d, []]));
  for (const row of results) {
    const e = { ...row, km: distance(row, f) };
    if (!matches(e, f)) continue;
    const start = e.starts_at.slice(0, 10);
    if (e.type === "festival" && e.ends_at && e.ends_at.slice(0, 10) > start) {
      const n = daysBetween(start, e.ends_at.slice(0, 10)) + 1;
      for (let i = 0; i < n; i++) byDay.get(addDays(start, i))?.push({ e, dayN: i + 1, dayOf: n });
    } else {
      byDay.get(start)?.push({ e });
    }
  }
  // A Festival's later days go after the day's own Events.
  for (const list of byDay.values()) list.sort((a, b) => Number((a.dayN ?? 1) > 1) - Number((b.dayN ?? 1) > 1));
  return byDay;
}

// ---- Pages ----

function Page(props: { f: Filters; title?: string; head?: any; children: any }) {
  const t = T[props.f.lang];
  const head = (
    <>
      <style>{CSS}</style>
      {props.head}
    </>
  );
  return (
    <Layout title={props.title ? `${props.title} – DanceCalendar` : "DanceCalendar"} lang={props.f.lang} head={head}>
      <header class="top">
        <div>
          <a class="home" href={href(props.f, { w: "", d: "" })}>
            💃 DanceCalendar
          </a>
          <small>{t.sub}</small>
        </div>
        <a class="lang" href={href(props.f, { lang: props.f.lang === "de" ? "en" : "de" })}>
          {props.f.lang === "de" ? "EN" : "DE"}
        </a>
      </header>
      {props.children}
      <script dangerouslySetInnerHTML={{ __html: GEO_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: LIGHTS_SCRIPT }} />
    </Layout>
  );
}

function FilterBar(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  const r = f.r || DEFAULT_RADIUS;
  const toggleStyle = (s: string) => (f.styles.includes(s) ? f.styles.filter((x) => x !== s) : [...f.styles, s]);
  return (
    <nav class="filters">
      <div class="views">
        <a class={f.view ? "" : "on"} href={href(f, { view: "", d: "" })}>
          🖼 {t.feed}
        </a>
        <a class={f.view ? "on" : ""} href={href(f, { view: "cal", w: "" })}>
          📅 {t.calendar}
        </a>
      </div>
      <details class="place">
        <summary class="chip on">
          📍 {!f.c ? t.noPlace : r === "all" ? `${t.here} · ${t.anywhere}` : `${t.here} · ${r} km`} ▾
        </summary>
        <div class="row">
          <a class="chip" href={href(f, { c: "" })} data-geo data-fail={t.noGeo}>
            📍 {t.me}
          </a>
          <a class="chip" href={href(f, {}, "/karte")}>
            🗺 {t.map}
          </a>
        </div>
        {f.c && (
          <div class="row">
            <span class="label">{t.radius}</span>
            {RADII.map((x) => (
              <a class={`chip ${r === x ? "on" : ""}`} href={href(f, { r: x })}>
                {x === "all" ? t.anywhere : `${x} km`}
              </a>
            ))}
          </div>
        )}
      </details>
      <div class="scroll">
        {STYLES.map(([k, name]) => (
          <a class={`chip ${f.styles.includes(k) ? "on" : ""}`} href={href(f, { styles: toggleStyle(k) })}>
            {name}
          </a>
        ))}
      </div>
      <div class="types">
        <a class={f.type ? "" : "on"} href={href(f, { type: "" })}>
          {t.all}
        </a>
        {TYPES.map((k) => (
          <a class={f.type === k ? "on" : ""} href={href(f, { type: k })}>
            {t[PLURAL[k]]}
          </a>
        ))}
      </div>
      {!f.c && (
        <p class="hint" data-autogeo>
          {t.hint}
        </p>
      )}
    </nav>
  );
}

// ---- PROTOTYPE: design review variants (issues/29-design-review-and-desktop.md) ----
// Three desktop layouts of the Flyer feed on this route, switched with ?variant= and the bar at the bottom.
// Below 900px every variant is today's phone layout. Throwaway: lives on the prototype/design-review branch.
const VARIANTS: [string, string][] = [
  ["", "Heute (Spalte)"],
  ["A", "Pinnwand"],
  ["B", "Seitenleiste + Agenda"],
  ["C", "Wochenbrett + Panel"],
];

function Switcher(props: { f: Filters }) {
  const i = VARIANTS.findIndex(([k]) => k === props.f.v);
  const at = (n: number) => VARIANTS[(i + n + VARIANTS.length) % VARIANTS.length][0];
  return (
    <div class="proto-switch">
      <a href={href(props.f, { v: at(-1) })} data-key="ArrowLeft">←</a>
      <span>
        {props.f.v || "–"} · {VARIANTS[i][1]}
      </span>
      <a href={href(props.f, { v: at(1) })} data-key="ArrowRight">→</a>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("keydown",(e)=>{if(e.target.closest("input,textarea,[contenteditable]"))return;const a=document.querySelector('.proto-switch [data-key="'+e.key+'"]');if(a)location.href=a.href;});`,
        }}
      />
    </div>
  );
}

function MiniMonth(props: { f: Filters; today: string; byDay: Map<string, OnDay[]> }) {
  const { f, today } = props;
  const first = `${today.slice(0, 7)}-01`;
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const dows = f.lang === "de" ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  return (
    <div class="mini">
      <b>{monthName(first, f.lang)}</b>
      <div class="mgrid">
        {dows.map((d) => (
          <span class="dow">{d}</span>
        ))}
        {range(start, 42).map((d) => {
          const n = props.byDay.get(d)?.length ?? 0;
          const cls = [d.slice(0, 7) !== today.slice(0, 7) ? "out" : "", d === today ? "today" : "", n ? "has" : ""].join(" ");
          return (
            <a class={cls} href={n ? `#day-${d}` : href(f, { view: "cal", d })}>
              {Number(d.slice(8))}
            </a>
          );
        })}
      </div>
    </div>
  );
}

const PANEL_SCRIPT = `(() => {
  const panel = document.getElementById("panel");
  if (!panel) return;
  document.addEventListener("click", async (ev) => {
    const a = ev.target.closest(".v-C .card");
    if (!a || innerWidth < 900) return;
    ev.preventDefault();
    const html = await (await fetch(a.href)).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("header.top, footer, script, .proto-switch").forEach((n) => n.remove());
    panel.innerHTML = '<button class="close" onclick="this.parentNode.hidden=true">✕</button>' + doc.body.innerHTML;
    panel.hidden = false;
    document.querySelectorAll(".v-C .card.open").forEach((c) => c.classList.remove("open"));
    a.classList.add("open");
  });
})();`;

const PROTO_CSS = `
  .proto-switch { position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:50; display:flex; gap:14px; align-items:center;
    background:#111; color:#fff; border:1px solid #333; border-radius:999px; padding:8px 16px; font:600 13px system-ui; box-shadow:0 6px 20px rgba(0,0,0,.35); }
  .proto-switch a { color:#ffeb3b; font-size:16px; }
  .side .mini { display:none; }
  #panel { display:none; }
  /* phone: the Pinnwand day tile reads as a heading line, "Mo 2. Nov · 3 Events" */
  h2.tile { display:flex; align-items:baseline; gap:6px; }
  h2.tile .cnt { margin-left:auto; font-size:13px; font-weight:600; color:var(--mute); }
  h2.tile.today .wd { color:var(--party); } @media (max-width: 899px) { h2.tile .num::after { content:"."; } }
  .card.wall .hero { position:relative; overflow:hidden; isolation:isolate; aspect-ratio:4 / 5; }
  .card.wall .hero::before { content:""; position:absolute; inset:-20px; z-index:-1; background:var(--img) center / cover; filter:blur(18px) brightness(.55); }
  .card.wall .hero img { width:100%; height:100%; max-height:none; object-fit:contain; }
  .card.wall .body { display:block; padding:10px 14px 12px; } .card.wall .ttl { font-weight:800; font-size:16px; }
  /* tablet: two Flyers side by side, the day heading across both */
  @media (min-width: 600px) and (max-width: 899px) {
    body:has(.v-A) { max-width:none; }
    .v-A .days { display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:0 16px 40px; }
    .v-A .days section, .v-A .days .cards { display:contents; }
    .v-A h2.tile { grid-column:1 / -1; margin:12px 0 -4px; padding:0; }
    .v-A .card.wall { margin:0; }
  }
  @media (min-width: 900px) {
    body:has(.v-A), body:has(.v-B), body:has(.v-C) { max-width:none; }
    body:has(.v-A) footer, body:has(.v-B) footer, body:has(.v-C) footer { padding:0 32px 70px; }

    /* A: Pinnwand – one sticky bar, then a wall of whole Flyers, each day opened by a tile */
    .v-A .layout { max-width:1640px; margin:0 auto; }
    body:has(.v-A) header.top { padding:12px max(32px, calc((100vw - 1640px) / 2 + 32px)); }
    .v-A .filters { box-shadow:0 1px 0 var(--line); }
    .v-A .hint { flex:1 1 260px; font-size:12px; }
    .v-A .main { display:grid; grid-template-columns:auto 1fr auto; align-items:center; column-gap:20px; padding:14px 32px 0; }
    .v-A .main > .bar { display:contents; }
    .v-A .bar .range { grid-column:1; grid-row:1; font-size:15px; }
    .v-A .bar .nav { grid-column:3; grid-row:1; }
    .v-A .strip { grid-column:2; grid-row:1; padding:0 !important; justify-content:flex-start; gap:6px; }
    .v-A .ring:hover .disc { transform:scale(1.06); }
    .v-A .main > .days, .v-A .main > .empty { grid-column:1 / -1; }
    .v-A .days { grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)) !important; gap:22px !important; padding:20px 0 40px !important; }
    .v-A .card.wall { grid-column:span 2; }
    .v-A h2.tile { display:flex !important; flex-direction:column; justify-content:space-between; margin:0; padding:16px !important; border:0 !important;
      background:var(--card); border-radius:16px; box-shadow:inset 0 0 0 1px var(--line); scroll-margin-top:120px; min-height:180px; }
    .v-A h2.tile .wd { font-size:15px; font-weight:700; color:var(--mute); text-transform:uppercase; letter-spacing:.06em; }
    .v-A h2.tile .num { font-size:64px; font-weight:800; line-height:.9; margin-top:auto; }
    .v-A h2.tile .mon { font-size:16px; font-weight:700; margin-bottom:auto; }
    .v-A h2.tile .wd { font-size:12px !important; }
    .v-A h2.tile .cnt { font-size:13px; font-weight:600; color:var(--mute); }
    .v-A h2.tile.today { background:var(--party); box-shadow:none; color:#fff; } .v-A h2.tile.today .wd, .v-A h2.tile.today .cnt { color:#ffe0ec; }
    .v-A .card.wall { display:flex; flex-direction:column; transition:transform .15s, box-shadow .15s; }
    .v-A .card.wall:hover { transform:translateY(-3px); box-shadow:0 12px 28px rgba(0,0,0,.16); }
    .v-A .card.wall:focus-visible { outline:3px solid var(--party); outline-offset:3px; }
    .v-A .card.wall .hero { aspect-ratio:4 / 5; overflow:hidden; isolation:isolate; }
    .v-A .card.wall .hero::before { content:""; position:absolute; inset:-20px; z-index:-1; background:var(--img) center / cover; filter:blur(18px) brightness(.55); }
    .v-A .card.wall .hero img { width:100%; height:100%; max-height:none; object-fit:contain; transition:transform .3s; }
    .v-A .card.wall:hover .hero img { transform:scale(1.03); }
    .v-A .card.wall .body { padding:12px 14px 14px; display:flex; flex-direction:column; gap:3px; }
    .v-A .card.wall .ttl { font-size:16px; font-weight:800; line-height:1.2; }
    .v-A .card.wall .meta { font-size:13px; } .v-A .card.wall .venue { color:var(--mute); }
    .v-A .card.wall .by { font-size:12px; }
    .v-A .filters { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; padding:10px 32px; }
    .v-A .filters > * { margin:0 !important; }
    .v-A .views, .v-A .types { flex:none; }
    .v-A .scroll { padding:0; flex-wrap:wrap; }

    .v-A .views a, .v-A .types a, .v-C .views a, .v-C .types a { padding:6px 14px; white-space:nowrap; }
    .v-A .days { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:18px; padding:0 32px; align-items:start; }
    .v-A .days section, .v-A .days .cards { display:contents; }


    .v-A .card { margin:0; }


    /* B: Seitenleiste – filters and a month on the left, an agenda of rows on the right */
    .v-B .layout { display:grid; grid-template-columns:300px 1fr; gap:28px; max-width:1180px; margin:0 auto; padding:0 24px; }
    .v-B .side { position:sticky; top:12px; align-self:start; }
    .v-B .side .filters { position:static; border:0; background:none; padding:12px 0; }
    .v-B .side .filters > * { margin-left:0; margin-right:0; }
    .v-B .side .scroll { flex-wrap:wrap; padding:0; }
    .v-B .side .types { flex-wrap:wrap; }
    .v-B .side .mini { display:block; background:var(--card); border-radius:14px; padding:12px; margin-top:8px; }
    .v-B .mgrid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin-top:8px; text-align:center; font-size:12px; }
    .v-B .mgrid .dow { color:var(--mute); font-size:10px; }
    .v-B .mgrid a { padding:4px 0; border-radius:6px; } .v-B .mgrid a.out { opacity:.3; }
    .v-B .mgrid a.has { background:rgba(255,61,139,.22); font-weight:700; } .v-B .mgrid a.today { outline:2px solid var(--party); }
    .v-B .strip { display:none; }
    .v-B .bar, .v-B h2.day { padding-left:0; padding-right:0; }
    .v-B .card { display:grid; grid-template-columns:200px 1fr; margin:8px 0 12px; }
    .v-B .card .hero img { height:100%; min-height:200px; max-height:260px; }
    .v-B .card .ov { display:none; }
    .v-B .card .body { padding:16px 20px; font-size:14px; }
    .v-B .card .body .ttl { display:none; }
    .v-B .card .body::before { content:attr(data-title); display:block; font-size:20px; font-weight:800; margin-bottom:6px; }

    /* C: Wochenbrett – a column per day, details open in a panel on the right */
    .v-C .layout { display:grid; grid-template-columns:minmax(0, 1fr); }
    .v-C .layout:has(#panel:not([hidden])) { grid-template-columns:minmax(0, 1fr) 440px; }
    .v-C .side { grid-column:1 / -1; } .v-C .main { grid-column:1; min-width:0; } .v-C #panel { grid-column:2; grid-row:2; }
    .v-C .filters { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; padding:10px 24px; }
    .v-C .filters > * { margin:0 !important; } .v-C .views, .v-C .types { flex:none; } .v-C .scroll { padding:0; }
    .v-C .strip { display:none; }
    .v-C .bar { padding:12px 24px 0; }
    .v-C .days { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(160px, 1fr); gap:10px; padding:10px 24px; overflow-x:auto; }
    .v-C .days section { background:var(--card); border-radius:12px; padding:0 8px 8px; min-height:60vh; }
    .v-C h2.day { padding:10px 2px; font-size:14px; position:sticky; top:0; }
    .v-C .card { margin:0 0 10px; border-radius:10px; }
    .v-C .card.open { outline:3px solid var(--party); }
    .v-C .hero img { height:200px; max-height:none; }
    .v-C .ov { display:block; padding:20px 8px 6px; font-size:12px; } .v-C .ov .ttl { font-size:14px; }
    .v-C .card .body { display:none; }
    .v-C #panel:not([hidden]) { display:block; position:sticky; top:0; height:100vh; overflow:auto; background:var(--card); border-left:1px solid var(--line); padding-top:8px; }
    .v-C #panel .close { float:right; margin:4px 12px; border:0; background:none; font-size:20px; cursor:pointer; }
    .v-C #panel .filters { display:none; }
  }
`;

function FeedPage(props: { f: Filters; today: string; monday: string; byDay: Map<string, OnDay[]> }) {
  const { f, today, monday, byDay } = props;
  const t = T[f.lang];
  const days = [...byDay.keys()];
  const thisMonday = addDays(today, -((weekday(today) + 6) % 7));
  // ‹ leads back to the default view once it reaches this week.
  const prev = monday && monday > thisMonday ? (addDays(monday, -7) > thisMonday ? addDays(monday, -7) : "") : null;
  const next = addDays(monday || thisMonday, 7);
  const any = [...byDay.values()].some((l) => l.length);
  return (
    <Page f={f} head={<style dangerouslySetInnerHTML={{ __html: PROTO_CSS + STORY_CSS + BOARD_CSS + DANCECARD_CSS }} />}>
      {!monday && <Board f={f} days={days} today={today} byDay={byDay} />}
      <div class={`v-${f.v || "0"}`}>
      <div class="layout">
      <aside class="side">
        <FilterBar f={f} />
        <MiniMonth f={f} today={today} byDay={byDay} />
      </aside>
      <div class="main">
      <div class="bar">
        <span class="range">
          {short(days[0], f.lang)} – {short(days.at(-1)!, f.lang)}
        </span>
        <span class="nav">
          {prev !== null ? <a href={href(f, { w: prev })}>‹</a> : <span class="off">‹</span>} <a href={href(f, { w: next })}>›</a>
        </span>
      </div>
      <div class="strip">
        {days.map((d) => {
          const list = byDay.get(d)!;
          const cover = list.find((o) => o.e.flyer_key)?.e.flyer_key;
          return (
            <a class={list.length ? "ring" : "ring none"} href={`#day-${d}`} data-story={list.length ? d : undefined}
               data-ids={list.map((o) => o.e.id).join(",")}>
              <span class="disc" style={cover ? `--img:url('/${cover}')` : undefined}>
                {list.length ? <span class="cnt">{list.length}</span> : null}
              </span>
              <span class="lbl">{d === today ? t.today : weekdayShort(d, f.lang)}</span>
              <b>{Number(d.slice(8))}.</b>
            </a>
          );
        })}
      </div>
      <main class="days">
      {[...byDay].map(([d, all]) => {
        const list = f.v === "A" ? all.filter((o) => !o.dayN || o.dayN === 1 || d === days[0]) : all;
        if (!list.length && f.v !== "C") return null;
        const [wd, date] = longDay(d, f.lang).split(", ");
        return (
          <section>
            {f.v === "A" ? (
              <h2 class={d === today ? "day tile today" : "day tile"} id={`day-${d}`}>
                <span class="wd">{d === today ? t.today : wd}</span>
                <span class="num">{Number(d.slice(8))}</span>
                <span class="mon">{date.replace(/^\d+\.\s*/, "")}</span>
                <span class="cnt">{list.length === 1 ? "1 Event" : `${list.length} Events`}</span>
              </h2>
            ) : (
              <h2 class={d === today ? "day today" : "day"} id={`day-${d}`}>
                {d === today && <span class="now">{t.today}</span>}
                {longDay(d, f.lang)}
              </h2>
            )}
            <div class="cards">
              {list.map((o) => (
                <Card f={f} o={o} day={d} wall={f.v === "A"} />
              ))}
            </div>
          </section>
        );
      })}
      </main>
      {!any && <p class="empty">{t.none}</p>}
      </div>
      {f.v === "C" && <aside id="panel" hidden />}
      </div>
      </div>
      <Switcher f={f} />
      <script type="application/json" id="stories" dangerouslySetInnerHTML={{ __html: storyData(f, today, byDay) }} />
      <script dangerouslySetInnerHTML={{ __html: STORY_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: DANCECARD_SCRIPT(f.lang) }} />
      <script dangerouslySetInnerHTML={{ __html: PANEL_SCRIPT }} />
    </Page>
  );
}

// ---- PROTOTYPE: the room lights (issues/29-design-review-and-desktop.md) ----
// Behind every Dancer page a live light show drawn by a WebGL shader: three moving-head beams sweeping
// down through haze, a glow on the floor, film grain. The beams take their colours from the Flyer in the
// middle of the screen (sampled from the image itself, so no colours are stored), and fade to the next
// Flyer's as the Dancer scrolls, so the room is lit like the party being looked at. Without WebGL or
// JavaScript the fixed spotlights of the CSS stay; reduced motion freezes the beams but still recolours
// them. Drawn at half resolution, at most 30 frames a second, and not at all while the tab is hidden.
const LIGHTS_SCRIPT = `(() => {
  const cv = document.createElement("canvas");
  const gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
  if (!gl) return;
  const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FS = [
    "precision mediump float;",
    "uniform vec2 r;uniform float t,s;uniform vec3 a,b,c;",
    "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    "  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){return .55*n(p)+.3*n(p*2.03+7.1)+.15*n(p*4.01+3.7);}",
    // a beam hung at o, swinging around straight down by ang, w wide
    "float beam(vec2 uv,vec2 o,float ang,float w){vec2 d=uv-o;float k=atan(d.x,-d.y)-ang;",
    "  return exp(-k*k/(w*w))*smoothstep(-.05,.25,-d.y)*mix(1.,.25,clamp(length(d)/1.8,0.,1.));}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/r.y;float W=r.x/r.y;",
    "  float haze=fbm(uv*vec2(2.2,3.)+vec2(t*.04,-t*.025+s*.0004));",
    "  float hz=.35+1.1*haze;",
    "  vec3 col=vec3(.047,.039,.063);",
    "  col+=a*beam(uv,vec2(W*.12,1.08),sin(t*.31)*.55-.25,.11)*hz*.55;",
    "  col+=b*beam(uv,vec2(W*.88,1.08),sin(t*.27+2.)*.55+.25,.11)*hz*.55;",
    "  col+=c*beam(uv,vec2(W*.5,1.1),sin(t*.19+4.)*.7,.08)*hz*.45;",
    "  vec2 f1=vec2(W*(.5+.35*sin(t*.11)),.02),f2=vec2(W*(.5+.4*sin(t*.13+3.)),.0);",
    "  col+=a*exp(-dot(uv-f1,uv-f1)*5.)*.16+b*exp(-dot(uv-f2,uv-f2)*4.)*.13;",
    "  col+=(a+b+c)*haze*haze*.025;",
    "  vec2 q=gl_FragCoord.xy/r-.5;col*=1.-dot(q,q)*.9;",
    "  col+=(h(gl_FragCoord.xy+fract(t)*91.)-.5)*.028;",
    "  gl_FragColor=vec4(col,1.);}",
  ].join("\\n");
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (k) => gl.getUniformLocation(pr, k);
  const U = { r: u("r"), t: u("t"), s: u("s"), a: u("a"), b: u("b"), c: u("c") };

  cv.className = "lights";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  document.documentElement.classList.add("lit");

  // The house colours until a Flyer comes into view: the page's pink, violet and amber.
  const HOUSE = [[1, .24, .55], [.49, .3, 1], [1, .69, .18]];
  const cur = HOUSE.map((x) => x.slice()), want = HOUSE.map((x) => x.slice());

  // A Flyer's three strongest colours: hue buckets weighted by saturation and brightness, each brightened
  // to full strength, so a dark Flyer still lights the room.
  const cache = new Map();
  const palette = (img) => {
    if (cache.has(img.src)) return cache.get(img.src);
    let px;
    try {
      const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      x.canvas.width = x.canvas.height = 32;
      x.drawImage(img, 0, 0, 32, 32);
      px = x.getImageData(0, 0, 32, 32).data;
    } catch { return null; }
    const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < .12 || mx < .15) continue;
      let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      const bin = bins[Math.floor(((hue + 6) % 6) * 2) % 12], w = (d / mx) * mx * mx;
      bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
    }
    const top = bins.filter((x) => x.w > 0).sort((p, q) => q.w - p.w).slice(0, 3)
      .map((x) => { const m = Math.max(x.r, x.g, x.b) || 1; return [x.r / m, x.g / m, x.b / m]; });
    const out = top.length ? [0, 1, 2].map((i) => top[i] || top[i % top.length].map((v, j) => (v + HOUSE[i][j]) / 2)) : null;
    cache.set(img.src, out);
    return out;
  };
  const light = (img) => {
    const go = () => { const p = palette(img); if (p) p.forEach((c, i) => (want[i] = c)); kick(); };
    if (img.complete && img.naturalWidth) go(); else img.addEventListener("load", go, { once: true });
  };

  // The Flyer crossing the middle band of the screen sets the colours.
  const io = new IntersectionObserver((list) => list.forEach((x) => x.isIntersecting && light(x.target)),
    { rootMargin: "-40% 0px -40% 0px" });
  const watch = () => document.querySelectorAll('img[src^="/flyers/"]').forEach((img) => {
    if (img.dataset.lit) return;
    img.dataset.lit = "1";
    if (img.closest(".story")) return;
    io.observe(img);
  });
  watch();
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  // The Story player shows one Flyer at a time; it lights the room while it is open.
  document.addEventListener("load", (ev) => { if (ev.target.closest && ev.target.closest(".story")) light(ev.target); }, true);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const size = () => {
    const k = Math.min(devicePixelRatio || 1, 2) * .5;
    cv.width = Math.round(innerWidth * k); cv.height = Math.round(innerHeight * k);
    gl.viewport(0, 0, cv.width, cv.height);
    kick();
  };
  let last = 0, raf = 0, t0 = performance.now();
  const frame = (now) => {
    raf = 0;
    let moving = false;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const d = want[i][j] - cur[i][j];
      if (Math.abs(d) > .002) { cur[i][j] += d * .05; moving = true; } else cur[i][j] = want[i][j];
    }
    if (now - last >= 33) {
      last = now;
      gl.uniform2f(U.r, cv.width, cv.height);
      gl.uniform1f(U.t, still ? 12 : (now - t0) / 1000);
      gl.uniform1f(U.s, scrollY);
      gl.uniform3fv(U.a, cur[0]); gl.uniform3fv(U.b, cur[1]); gl.uniform3fv(U.c, cur[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!document.hidden && (!still || moving)) raf = requestAnimationFrame(frame);
  };
  function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  addEventListener("resize", size);
  document.addEventListener("visibilitychange", kick);
  if (still) addEventListener("scroll", kick, { passive: true });
  size();
})();`;

// ---- PROTOTYPE: the departure board (issues/29-design-review-and-desktop.md) ----
// "Where do I dance tonight?" answered before any filter: tonight's Events as a split-flap board like a
// station's, with a ticking clock, each row's start time on flap tiles and a live status (in 45 Min,
// LÄUFT, VORBEI). Once every Event of today is over it shows the next day that has one. The status and
// the flapping need JavaScript; without it the board is a plain list of times, titles and Venues.
const BOARD_ROWS = 6;
const HOURS_WITHOUT_END = 3;
const berlinNow = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16).replace(" ", "T");
const endOf = (e: Row) => e.ends_at ?? new Date(Date.parse(`${e.starts_at}Z`) + HOURS_WITHOUT_END * 3_600_000).toISOString().slice(0, 16);

function Board(props: { f: Filters; days: string[]; today: string; byDay: Map<string, OnDay[]> }) {
  const { f, days, today, byDay } = props;
  const de = f.lang === "de";
  const now = berlinNow();
  const ahead = (o: OnDay) => !!o.dayN || endOf(o.e) > now;
  const day = days.find((d) => (d === today ? byDay.get(d)!.some(ahead) : byDay.get(d)!.length));
  if (!day) return null;
  const list = byDay.get(day)!;
  const shown = list.slice(0, BOARD_ROWS);
  const label =
    day === today
      ? de ? "Heute Abend" : "Tonight"
      : `${de ? "Als Nächstes" : "Up next"} · ${weekdayShort(day, f.lang)} ${Number(day.slice(8))}.${Number(day.slice(5, 7))}.`;
  return (
    <section class="board" aria-label={label}>
      <div class="bhead">
        <span class="blabel">
          <i class="bulb" /> {label}
        </span>
        <span class="clock" aria-hidden="true" data-clock>
          {now.slice(11).split("").map((ch) => (ch === ":" ? <span class="colon">:</span> : <span class="flap">{ch}</span>))}
        </span>
      </div>
      <div class="bcols" aria-hidden="true">
        <span>{de ? "Zeit" : "Time"}</span>
        <span>{de ? "Event · Ort" : "Event · Venue"}</span>
        <span>Status</span>
      </div>
      <ol>
        {shown.map((o) => {
          const { e } = o;
          return (
            <li>
              <a class={`brow k-${kind(e)}${e.cancelled ? " gone" : ""}`} href={href(f, {}, `/events/${e.id}`)}
                 data-start={o.dayN ? undefined : e.starts_at} data-end={o.dayN ? undefined : endOf(e)}>
                <span class="btime">
                  {o.dayN ? (
                    <span class="bday">{`${T[f.lang].day} ${o.dayN}/${o.dayOf}`}</span>
                  ) : (
                    e.starts_at.slice(11).split("").map((ch) => (ch === ":" ? <span class="colon">:</span> : <span class="flap">{ch}</span>))
                  )}
                </span>
                <span class="bwhat">
                  <span class="btitle" data-scramble>{e.title}</span>
                  <span class="bwhere">
                    <TypeLabel f={f} e={e} /> · {e.venue}
                    {km(e)}
                  </span>
                </span>
                <span class="bstat">{e.cancelled ? (de ? "Abgesagt" : "Cancelled") : o.dayN ? "Festival" : ""}</span>
              </a>
            </li>
          );
        })}
      </ol>
      {list.length > shown.length && (
        <a class="bmore" href={`#day-${day}`}>
          + {list.length - shown.length} {de ? "weitere" : "more"} ↓
        </a>
      )}
      <script dangerouslySetInnerHTML={{ __html: BOARD_SCRIPT(f.lang) }} />
    </section>
  );
}

const BOARD_SCRIPT = (lang: Lang) => `(() => {
  const de = ${JSON.stringify(lang === "de")};
  const board = document.currentScript.parentElement;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16).replace(" ", "T");
  const mins = (a, b) => Math.round((Date.parse(b + "Z") - Date.parse(a + "Z")) / 60000);
  const DIGITS = "0123456789", LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // One tile turns over to a new character, rattling through a few on the way like a real flap.
  const flip = (tile, to, delay) => {
    if (tile.textContent === to && delay === undefined) return;
    if (still) { tile.textContent = to; return; }
    let n = 4 + Math.floor(Math.random() * 6);
    setTimeout(function step() {
      tile.classList.remove("turn"); void tile.offsetWidth; tile.classList.add("turn");
      tile.textContent = n-- > 0 ? DIGITS[Math.floor(Math.random() * 10)] : to;
      if (n >= 0) setTimeout(step, 55);
    }, delay || 0);
  };
  const setTiles = (el, text, stagger) => {
    const tiles = el.querySelectorAll(".flap");
    text.replace(":", "").split("").forEach((ch, i) => flip(tiles[i], ch, stagger ? i * 90 + stagger : undefined));
  };

  // Titles settle letter by letter from the left, as the destination does on a station board.
  const scramble = (el, delay) => {
    const final = el.textContent; if (still) return;
    let k = 0;
    setTimeout(function step() {
      el.textContent = final.split("").map((ch, i) => i < k || ch === " " ? ch : LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
      if (k++ <= final.length) setTimeout(step, 28);
    }, delay);
  };

  const status = (row, t) => {
    const s = row.querySelector(".bstat");
    if (!row.dataset.start || row.classList.contains("gone")) return;
    const until = mins(t, row.dataset.start), left = mins(t, row.dataset.end);
    let text, cls;
    if (left <= 0) { text = de ? "Vorbei" : "Over"; cls = "past"; }
    else if (until <= 0) { text = de ? "Läuft" : "On now"; cls = "live"; }
    else if (until < 60) { text = "in " + until + " Min"; cls = until <= 30 ? "soon" : ""; }
    else if (until < 24 * 60) { const h = Math.floor(until / 60), m = until % 60; text = "in " + (until < 180 && m ? h + ":" + String(m).padStart(2, "0") : Math.round(until / 60)) + (de ? " Std" : " h"); cls = ""; }
    else { text = "in " + Math.round(until / 1440) + (de ? " T" : " d"); cls = ""; }
    if (s.textContent !== text) { s.textContent = text; if (!still) { s.classList.remove("blink"); void s.offsetWidth; s.classList.add("blink"); } }
    row.classList.toggle("live", cls === "live"); row.classList.toggle("soon", cls === "soon"); row.classList.toggle("past", cls === "past");
  };

  const rows = [...board.querySelectorAll(".brow")];
  const clock = board.querySelector("[data-clock]");
  let shown = "";
  const tick = (first) => {
    const t = now();
    if (t !== shown) { setTiles(clock, t.slice(11), first ? 1 : undefined); shown = t; rows.forEach((r) => status(r, t)); }
  };
  rows.forEach((r, i) => {
    const time = r.querySelector(".btime");
    if (time.querySelector(".flap")) setTiles(time, [...time.querySelectorAll(".flap")].map((x) => x.textContent).join(""), 150 + i * 140);
    scramble(r.querySelector("[data-scramble]"), 200 + i * 140);
  });
  tick(true);
  setInterval(tick, 5000);
})();`;

const BOARD_CSS = `
  .board { position:relative; margin:4px 16px 14px; padding:12px 12px 6px; border-radius:16px; color:#fff;
    background:linear-gradient(180deg,#141118,#08070a); border:1px solid #2a2431;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px -18px rgba(0,0,0,.9), 0 0 0 4px rgba(0,0,0,.35); }
  .board::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:repeating-linear-gradient(0deg, rgba(255,255,255,.018) 0 1px, transparent 1px 3px); }
  .bhead { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  .blabel { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; color:#ffc53d;
    text-shadow:0 0 12px rgba(255,197,61,.45); }
  .bulb { width:8px; height:8px; border-radius:50%; background:#ffc53d; box-shadow:0 0 10px #ffc53d; animation:bulb 1.6s steps(2) infinite; }
  @keyframes bulb { 50% { opacity:.25; } }
  .flap { position:relative; display:inline-block; width:.72em; text-align:center; margin-right:2px; border-radius:4px;
    font-family:ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace; font-weight:800; color:#fff; font-variant-numeric:tabular-nums;
    background:linear-gradient(180deg,#2c2832 0 49%,#0b0a0d 49% 51%,#221f27 51%); box-shadow:0 2px 0 #000, inset 0 1px 0 rgba(255,255,255,.08);
    transform-origin:50% 50%; }
  .flap.turn { animation:turn .11s ease-in; }
  @keyframes turn { 0% { transform:scaleY(1); } 50% { transform:scaleY(.15); filter:brightness(1.8); } 100% { transform:scaleY(1); } }
  .colon { display:inline-block; width:.3em; text-align:center; font-weight:800; color:#8a8094; }
  .clock { font-size:17px; line-height:1.45; white-space:nowrap; }
  .clock .colon { animation:bulb 2s steps(2) infinite; }
  .bcols { display:grid; grid-template-columns:76px 1fr auto; gap:10px; padding:0 4px 4px; font-size:10px; font-weight:800; letter-spacing:.16em;
    text-transform:uppercase; color:#6f667a; border-bottom:1px solid #26212c; }
  .board ol { list-style:none; margin:0; padding:0; } .board li { padding:0; border:0; }
  .brow { position:relative; display:grid; grid-template-columns:76px 1fr auto; gap:10px; align-items:center; padding:10px 4px; border-bottom:1px solid #1d1a22;
    transition:background .15s; }
  .board li:last-child .brow { border-bottom:0; }
  .brow::before { content:""; position:absolute; left:-12px; top:10px; bottom:10px; width:3px; border-radius:0 3px 3px 0; background:var(--k); }
  .brow:hover, .brow:focus-visible { background:rgba(255,255,255,.04); }
  .k-party { --k:var(--party); } .k-workshop { --k:var(--workshop); } .k-festival { --k:var(--festival); } .k-course { --k:var(--course); }
  .btime { font-size:20px; line-height:1.4; white-space:nowrap; }
  .bday { font-size:12px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--festival); }
  .bwhat { min-width:0; display:flex; flex-direction:column; }
  .btitle { font-family:ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace; font-weight:800; font-size:14px; letter-spacing:.04em; text-transform:uppercase;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.25; color:#fff; }
  .bwhere { font-size:12px; color:var(--mute); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
  .bstat { justify-self:end; font-family:ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace; font-size:12px; font-weight:800; letter-spacing:.06em;
    text-transform:uppercase; color:#ffc53d; text-shadow:0 0 10px rgba(255,197,61,.4); white-space:nowrap; }
  .bstat.blink { animation:arrive .5s steps(2) 2; }
  @keyframes arrive { 50% { opacity:0; } }
  .brow.soon .bstat { color:#ff9a3d; text-shadow:0 0 12px rgba(255,154,61,.6); }
  .brow.live .bstat { color:#fff; background:var(--party); padding:3px 8px; border-radius:999px; text-shadow:none;
    box-shadow:0 0 16px rgba(255,61,139,.7); animation:pulse 2.4s ease-in-out infinite; }
  .brow.live .btitle { color:#ffd0e2; }
  .brow.past { opacity:.38; } .brow.past .bstat { color:var(--mute); text-shadow:none; }
  .brow.gone .btitle { text-decoration:line-through; } .brow.gone .bstat { color:#ff6b6b; text-shadow:0 0 10px rgba(255,80,80,.4); }
  .bmore { display:block; text-align:center; padding:8px 0 4px; font-size:12px; font-weight:700; letter-spacing:.06em; color:#ffc53d; }
  @media (min-width:900px) { .board { max-width:760px; margin:8px auto 18px; } .btime { font-size:22px; } .btitle { font-size:15px; } }
  @media (prefers-reduced-motion: reduce) { .bulb, .clock .colon, .brow.live .bstat { animation:none; } }
`;

// ---- PROTOTYPE: Stories (issues/29-design-review-and-desktop.md) ----
// The week's Flyers as WhatsApp-style Stories: each day in the strip is a ring with its first Flyer, and a
// tap plays that day's Flyers full screen, then the next day's. Without JavaScript a ring still jumps to
// its day. The player reads the days from this JSON, so the cards below stay as they are.
function storyData(f: Filters, today: string, byDay: Map<string, OnDay[]>): string {
  const t = T[f.lang];
  const days = [...byDay]
    .filter(([, list]) => list.length)
    .map(([d, list]) => ({
      d,
      label: d === today ? `${t.today} · ${short(d, f.lang)}` : longDay(d, f.lang),
      items: list.map(({ e, dayN, dayOf }) => {
        const styles = (JSON.parse(e.styles) as string[]).map((s) => STYLES.find(([k]) => k === s)?.[1] ?? s);
        return {
          id: e.id,
          href: href(f, {}, `/events/${e.id}`),
          img: e.flyer_key ? `/${e.flyer_key}` : "",
          title: e.title,
          kind: kind(e),
          type: t[kind(e)],
          when: dayN ? `${t.day} ${dayN}/${dayOf}` : timeRange(e),
          place: e.venue + km(e),
          on: dayLabel(e.starts_at.slice(0, 10), f.lang),
          start: e.starts_at,
          end: endOf(e),
          tags: [
            ...styles,
            e.intro_class_at ? `🎓 ${t.intro} ${e.intro_class_at.slice(11)}` : "",
            e.rule ? `↻ ${ruleWords(JSON.parse(e.rule) as Rule, f.lang)}` : "",
          ].filter(Boolean),
          cancelled: !!e.cancelled,
        };
      }),
    }));
  const labels = { details: "Details", close: f.lang === "de" ? "Schließen" : "Close", cancelled: t.cancelled };
  // "<" escaped so a title can't close the script tag.
  return JSON.stringify({ days, labels }).replace(/</g, "\\u003c");
}

const STORY_SCRIPT = `(() => {
  const data = JSON.parse(document.getElementById("stories").textContent);
  if (!data.days.length) return;
  const L = data.labels;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem("dc-seen") || "[]")); } catch {}
  const markRings = () => document.querySelectorAll(".ring[data-story]").forEach((r) =>
    r.classList.toggle("seen", r.dataset.ids.split(",").every((id) => seen.has(Number(id)))));
  markRings();

  const el = document.createElement("div");
  el.className = "story"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = '<div class="bg"></div><button class="side l" aria-label="‹">‹</button><div class="stage"></div><button class="side r" aria-label="›">›</button>';
  document.body.append(el);
  const stage = el.querySelector(".stage"), bg = el.querySelector(".bg");
  let di = 0, ii = 0, paused = false, downAt = 0, x0 = 0, y0 = 0;

  function render() {
    const day = data.days[di], it = day.items[ii];
    seen.add(it.id);
    try { localStorage.setItem("dc-seen", JSON.stringify([...seen].slice(-300))); } catch {}
    bg.style.backgroundImage = it.img ? "url('" + it.img + "')" : "";
    stage.innerHTML =
      '<div class="bars">' + day.items.map((_, i) => '<i class="' + (i < ii ? "done" : i === ii ? "now" : "") + '"><b></b></i>').join("") + "</div>" +
      '<div class="head"><span>' + esc(day.label) + "</span><small>" + (ii + 1) + "/" + day.items.length + '</small><button class="x" aria-label="' + L.close + '">✕</button></div>' +
      (it.img ? '<img class="pic" src="' + it.img + '" alt="Flyer: ' + esc(it.title) + '">' : '<div class="pic text">' + esc(it.title) + "</div>") +
      '<div class="info' + (it.cancelled ? " cancelled" : "") + '"><span class="kind k-' + it.kind + '">' + esc(it.type) + "</span>" +
      (it.cancelled ? ' <span class="kind k-cancel">' + esc(L.cancelled) + "</span>" : "") +
      '<h3 class="ttl">' + esc(it.title) + "</h3><p><b>" + esc(it.when) + "</b> · " + esc(it.place) + "</p>" +
      (it.tags.length ? '<p class="tags">' + it.tags.map((x) => '<span class="tag">' + esc(x) + "</span>").join("") + "</p>" : "") +
      '<a class="go" href="' + esc(it.href) + '">' + L.details + " ›</a></div>" +
      '<button class="keep" type="button" data-keep="' + it.id + '"></button>';
    stage.querySelector(".now b").addEventListener("animationend", next);
    el.classList.toggle("paused", paused);
    const after = data.days[di].items[ii + 1] || (data.days[di + 1] || {}).items?.[0];
    if (after && after.img) new Image().src = after.img;
  }
  function open(d, i = 0) {
    di = d; ii = i; paused = false;
    if (el.hidden) { el.hidden = false; document.documentElement.classList.add("story-open"); history.pushState({ story: 1 }, ""); }
    render();
  }
  function close(fromHistory) {
    if (el.hidden) return;
    el.hidden = true; document.documentElement.classList.remove("story-open"); markRings();
    if (!fromHistory && history.state && history.state.story) history.back();
  }
  function next() {
    if (ii + 1 < data.days[di].items.length) ii++;
    else if (di + 1 < data.days.length) { di++; ii = 0; }
    else return close();
    render();
  }
  function prev() {
    if (ii > 0) ii--;
    else if (di > 0) { di--; ii = data.days[di].items.length - 1; }
    render();
  }
  const day = (n) => { if (data.days[di + n]) { di += n; ii = 0; render(); } };
  const pause = (p) => { paused = p; el.classList.toggle("paused", p); };

  document.addEventListener("click", (ev) => {
    const r = ev.target.closest(".ring[data-story]");
    if (!r) return;
    ev.preventDefault();
    open(data.days.findIndex((d) => d.d === r.dataset.story));
  });
  el.addEventListener("click", (ev) => {
    if (ev.target.closest(".x")) return close();
    if (ev.target.closest(".side.l")) return day(-1);
    if (ev.target.closest(".side.r")) return day(1);
    if (ev.target === el || ev.target === bg) close();
  });
  // A short tap steps (left third back, the rest forward), holding pauses, a swipe changes day or closes.
  stage.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest("a, button")) return;
    downAt = Date.now(); x0 = ev.clientX; y0 = ev.clientY; pause(true);
  });
  stage.addEventListener("pointerup", (ev) => {
    if (!downAt) return;
    const dx = ev.clientX - x0, dy = ev.clientY - y0, held = Date.now() - downAt;
    downAt = 0; pause(false);
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) return close();
    if (Math.abs(dx) > 60) return day(dx < 0 ? 1 : -1);
    if (held > 250) return;
    const box = stage.getBoundingClientRect();
    ev.clientX - box.left < box.width / 3 ? prev() : next();
  });
  stage.addEventListener("pointercancel", () => { downAt = 0; pause(false); });
  window.addEventListener("keydown", (ev) => {
    if (el.hidden) return;
    const k = { ArrowRight: next, ArrowLeft: prev, ArrowDown: () => day(1), ArrowUp: () => day(-1), Escape: () => close(), " ": () => pause(!paused) }[ev.key];
    if (!k) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); k();
  }, true);
  window.addEventListener("popstate", () => close(true));
})();`;

const STORY_CSS = `
  /* the strip of day rings */
  .strip { gap:2px; padding:10px 12px 4px; }
  .ring { flex:none; width:60px; display:flex; flex-direction:column; align-items:center; font-size:11px; line-height:1.15; color:var(--ink); }
  .ring .disc { position:relative; width:52px; height:52px; border-radius:50%; padding:2.5px; margin-bottom:4px; transition:transform .15s;
    background:conic-gradient(from 210deg, var(--festival), var(--party), #7b1fa2, var(--workshop), var(--festival)); }
  .ring .disc::before { content:""; position:absolute; inset:2.5px; border-radius:50%; border:2.5px solid var(--bg);
    background:var(--img, linear-gradient(135deg,#3949ab,#8e24aa)) center top / cover, #222; }
  .ring.seen .disc { background:#3a3342; }
  .ring.none .disc { background:none; border:2px dashed var(--line); padding:0; }
  .ring.none .disc::before { display:none; }
  .ring.none { opacity:.45; }
  .ring .cnt { position:absolute; right:-3px; bottom:-2px; z-index:1; min-width:18px; height:18px; line-height:15px; text-align:center; border-radius:9px;
    background:var(--party); color:#fff; font-size:10px; font-weight:700; border:2px solid var(--bg); }
  .ring.seen .cnt { background:var(--mute); }
  .ring .lbl { color:var(--mute); } .ring b { font-size:14px; }
  .ring:active .disc { transform:scale(.94); }

  /* the player */
  html.story-open { overflow:hidden; }
  .story { position:fixed; inset:0; z-index:100; background:#000; display:flex; align-items:center; justify-content:center; gap:24px;
    animation:story-in .22s ease-out; touch-action:none; user-select:none; -webkit-user-select:none; }
  .story[hidden] { display:none; }
  @keyframes story-in { from { opacity:0; transform:scale(.96); } }
  .story .bg { position:absolute; inset:-60px; background:#111 center / cover; filter:blur(40px) brightness(.4) saturate(1.3); }
  .story .stage { position:relative; width:100%; height:100%; display:flex; flex-direction:column; color:#fff; overflow:hidden; background:#000; }
  .story .stage::before { content:""; position:absolute; top:0; left:0; right:0; height:90px; z-index:1; pointer-events:none;
    background:linear-gradient(rgba(0,0,0,.6), transparent); }
  .story .bars { position:absolute; top:10px; left:10px; right:10px; z-index:2; display:flex; gap:4px; }
  .story .bars i { flex:1; height:3px; border-radius:2px; background:rgba(255,255,255,.35); overflow:hidden; }
  .story .bars b { display:block; height:100%; width:0; background:#fff; }
  .story .bars .done b { width:100%; }
  .story .bars .now b { animation:story-fill 6s linear forwards; }
  .story.paused .bars .now b { animation-play-state:paused; }
  @keyframes story-fill { to { width:100%; } }
  .story .head { position:absolute; top:20px; left:12px; right:6px; z-index:2; display:flex; align-items:center; gap:8px; font-weight:700; font-size:14px;
    text-shadow:0 1px 3px rgba(0,0,0,.6); }
  .story .head small { opacity:.75; font-weight:500; margin-right:auto; }
  .story .x { border:0; background:none; color:#fff; font-size:22px; padding:6px 10px; cursor:pointer; }
  .story .pic { flex:1; min-height:0; width:100%; object-fit:contain; pointer-events:none; }
  .story .pic.text { display:flex; align-items:center; justify-content:center; text-align:center; padding:40px; font-size:30px; font-weight:800;
    background:linear-gradient(135deg,#3949ab,#8e24aa); }
  .story .info { position:absolute; left:0; right:0; bottom:0; padding:60px 16px calc(18px + env(safe-area-inset-bottom));
    background:linear-gradient(transparent, rgba(0,0,0,.55) 30%, rgba(0,0,0,.9)); font-size:14px; }
  .story .info p { margin:4px 0 0; }
  .story .info .ttl { margin:6px 0 0; font-size:22px; line-height:1.15; }
  .story .kind { display:inline-block; font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:2px 8px; border-radius:999px; color:#fff; }
  .story .k-party { background:var(--party); } .story .k-workshop { background:var(--workshop); } .story .k-festival { background:var(--festival); }
  .story .k-course { background:var(--course); } .story .k-cancel { background:#a30000; }
  .story .tag { background:rgba(255,255,255,.18); color:#fff; }
  .story .go { position:absolute; right:16px; bottom:calc(18px + env(safe-area-inset-bottom)); background:#fff; color:#111; font-weight:700;
    border-radius:999px; padding:8px 16px; font-size:14px; }
  .story .info:has(.go) { padding-right:120px; }
  .story .side { display:none; }
  .story.paused .info { opacity:.25; transition:opacity .3s .2s; }
  @media (min-width: 600px) {
    .story .stage { width:auto; height:calc(100vh - 48px); aspect-ratio:9 / 16; max-width:calc(100vw - 140px); border-radius:18px;
      box-shadow:0 30px 80px rgba(0,0,0,.6); }
    .story .side { display:block; position:relative; z-index:1; width:44px; height:44px; border-radius:50%; border:0; cursor:pointer;
      background:rgba(255,255,255,.18); color:#fff; font-size:26px; line-height:1; }
    .story .side:hover { background:rgba(255,255,255,.32); }
  }
  @media (prefers-reduced-motion: reduce) { .story { animation:none; } }
`;

// ---- PROTOTYPE: the Tanzkarte (issues/29-design-review-and-desktop.md) ----
// A carnet de bal, the card a ballgoer once wrote their dances on. A tap on "+ Tanzkarte" at a Flyer (or in
// a Story) writes the Event onto a paper card that stays in this browser only (localStorage, no account),
// across weeks. The card lists the kept Events by day, marks two that overlap in red ink, strikes the ones
// already danced, and hands them on as an .ics file or a message to share. Without JavaScript nothing shows.
const DANCECARD_SCRIPT = (lang: Lang) => `(() => {
  const de = ${JSON.stringify(lang === "de")};
  const L = de
    ? { add: "Tanzkarte", kept: "Notiert", title: "Tanzkarte", sub: (n) => n === 1 ? "1 Abend notiert" : n + " Abende notiert",
        empty: "Noch leer. Tippe bei einem Flyer auf <b>+ Tanzkarte</b>, und der Abend steht hier.", ics: "In den Kalender", share: "Teilen",
        clear: "Leeren", sure: "Tanzkarte leeren?", clash: (n) => "überschneidet sich mit Nr. " + n, done: "getanzt", cancelled: "abgesagt",
        remove: "Streichen", close: "Schließen", mine: "Meine Tanzkarte" }
    : { add: "Dance card", kept: "Noted", title: "Dance card", sub: (n) => n === 1 ? "1 evening noted" : n + " evenings noted",
        empty: "Still empty. Tap <b>+ Dance card</b> on a Flyer and the evening shows up here.", ics: "Add to calendar", share: "Share",
        clear: "Clear", sure: "Clear the dance card?", clash: (n) => "overlaps with no. " + n, done: "danced", cancelled: "cancelled",
        remove: "Strike", close: "Close", mine: "My dance card" };
  const KEY = "dc-card", WEEK = 7 * 86400000;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const now = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16).replace(" ", "T");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // This page's Events, by id, from the Stories' JSON.
  const pool = new Map();
  try { JSON.parse(document.getElementById("stories").textContent).days.forEach((d) => d.items.forEach((it) => pool.has(it.id) || pool.set(it.id, it))); } catch {}

  // Kept Events are copied whole, so the card still shows them on another week's page. A week after an
  // Event ended it falls off the card.
  let card = [];
  try { card = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  card = card.filter((it) => Date.parse(it.end + "Z") > Date.parse(now() + "Z") - WEEK);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(card)); } catch {} };
  const has = (id) => card.some((it) => it.id === id);
  window.dcKept = has;

  // ---- the stamp on every Flyer ----
  const idOf = (a) => Number((/\\/events\\/(\\d+)/.exec(a.getAttribute("href")) || [])[1]);
  document.querySelectorAll(".card").forEach((a) => {
    const id = idOf(a);
    if (!pool.has(id)) return;
    const b = document.createElement("span");
    b.className = "keep"; b.dataset.keep = id; b.setAttribute("role", "button"); b.tabIndex = 0;
    a.append(b);
  });
  const paint = () => {
    document.querySelectorAll("[data-keep]").forEach((b) => {
      const on = has(Number(b.dataset.keep)), html = on ? "<i>♥</i> " + L.kept : "<i>+</i> " + L.add;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
      if (b.innerHTML !== html) b.innerHTML = html;
    });
    document.querySelectorAll(".card").forEach((a) => a.classList.toggle("kept", has(idOf(a))));
    if (tab.querySelector("b").textContent !== String(card.length)) tab.querySelector("b").textContent = card.length;
    tab.classList.toggle("empty", !card.length);
  };

  // ---- the folded card at the corner, and the open card ----
  const tab = document.createElement("button");
  tab.className = "dc-tab"; tab.type = "button";
  tab.innerHTML = '<span class="tassel" aria-hidden="true"></span><i aria-hidden="true">❦</i><span class="lbl">' + L.mine + '</span><b>0</b>';
  tab.setAttribute("aria-label", L.mine);
  const dlg = document.createElement("dialog");
  dlg.className = "dc-sheet";
  document.body.append(tab, dlg);

  const sorted = () => [...card].sort((a, b) => a.start.localeCompare(b.start));
  const clashes = (list) => {
    const live = list.filter((it) => !it.cancelled);
    return new Map(list.map((it) => [it.id, live.filter((o) => o !== it && !it.cancelled && o.start < it.end && it.start < o.end)]));
  };

  function render() {
    const list = sorted(), over = clashes(list), t = now();
    const no = new Map(list.map((it, i) => [it.id, i + 1]));
    let day = "", rows = "";
    list.forEach((it) => {
      if (it.on !== day) { day = it.on; rows += '<li class="dc-day">' + esc(day) + "</li>"; }
      const past = it.end <= t, clash = over.get(it.id);
      rows += '<li class="dc-row k-' + it.kind + (past ? " past" : "") + (it.cancelled ? " gone" : "") + '">' +
        '<span class="no">' + no.get(it.id) + '.</span>' +
        '<a class="what" href="' + esc(it.href) + '"><span class="line"><span class="ttl">' + esc(it.title) + '</span><span class="dots"></span>' +
        '<span class="at">' + esc(it.when) + "</span></span>" +
        '<small>' + esc(it.place) + (past ? ' · <em>' + L.done + ' ✓</em>' : "") + (it.cancelled ? ' · <em class="red">' + L.cancelled + "</em>" : "") +
        (clash.length ? '<em class="red">⚡ ' + L.clash(clash.map((o) => no.get(o.id)).join(", ")) + "</em>" : "") + "</small></a>" +
        '<button class="rm" type="button" data-rm="' + it.id + '" aria-label="' + L.remove + '">✕</button></li>';
    });
    dlg.innerHTML =
      '<div class="paper"><button class="x" type="button" aria-label="' + L.close + '">✕</button>' +
      '<span class="orn tl">❦</span><span class="orn tr">❦</span>' +
      '<p class="eyebrow">Carnet de bal</p><h2>' + L.title + "</h2>" +
      '<p class="count">' + L.sub(list.length) + "</p><hr>" +
      (list.length ? "<ol>" + rows + "</ol>" : '<p class="none">' + L.empty + "</p>") +
      (list.length ? '<div class="acts"><button type="button" data-ics>📅 ' + L.ics + '</button><button type="button" data-share>💬 ' + L.share +
        '</button><button type="button" class="clr" data-clear>' + L.clear + "</button></div>" : "") +
      '<span class="orn bl">❦</span><span class="orn br">❦</span></div>';
  }

  function toggle(id, from) {
    if (has(id)) card = card.filter((it) => it.id !== id);
    else {
      const it = pool.get(id);
      if (!it) return;
      card.push({ id, title: it.title, kind: it.kind, when: it.when, on: it.on, start: it.start, end: it.end, place: it.place, href: it.href, cancelled: it.cancelled });
      fly(from);
    }
    save(); paint();
    if (dlg.open) render();
  }

  // A small heart leaves the Flyer and drops into the card at the corner.
  function fly(from) {
    if (still || !from) return;
    const a = from.getBoundingClientRect(), b = tab.getBoundingClientRect();
    const h = document.createElement("span");
    h.className = "dc-fly"; h.textContent = "♥";
    h.style.left = a.left + a.width / 2 - 14 + "px"; h.style.top = a.top + a.height / 2 - 14 + "px";
    document.body.append(h);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    h.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: "translate(" + dx * .5 + "px," + (dy * .5 - 120) + "px) scale(1.6)", opacity: 1, offset: .45 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.5)", opacity: .6 },
    ], { duration: 700, easing: "cubic-bezier(.5,0,.4,1)" }).onfinish = () => {
      h.remove();
      tab.animate([{ transform: "rotate(-6deg) scale(1)" }, { transform: "rotate(4deg) scale(1.15)" }, { transform: "rotate(-6deg) scale(1)" }], { duration: 380 });
    };
  }

  // An .ics with one VEVENT per kept Event, in Berlin time.
  function ics() {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const loc = (s) => s.replace(/-/g, "").replace(":", "") + "00";
    const txt = (s) => String(s).replace(/[\\\\,;]/g, (c) => "\\\\" + c);
    const ev = sorted().filter((it) => !it.cancelled).map((it) => [
      "BEGIN:VEVENT", "UID:dancecalendar-" + it.id + "@" + location.hostname, "DTSTAMP:" + stamp,
      "DTSTART;TZID=Europe/Berlin:" + loc(it.start), "DTEND;TZID=Europe/Berlin:" + loc(it.end),
      "SUMMARY:" + txt(it.title), "LOCATION:" + txt(it.place.replace(/ · [\\d.]+ km$/, "")), "URL:" + location.origin + it.href, "END:VEVENT",
    ].join("\\r\\n"));
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DanceCalendar//Tanzkarte//DE", ...ev, "END:VCALENDAR"].join("\\r\\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = (de ? "tanzkarte" : "dance-card") + ".ics";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // The card as a message: the system share sheet where there is one, else WhatsApp, where Flyers live.
  function share() {
    const text = L.mine + " 💃\\n\\n" + sorted().filter((it) => !it.cancelled)
      .map((it) => it.on + " " + it.when + "  " + it.title + "\\n" + it.place.replace(/ · [\\d.]+ km$/, "") + "\\n" + location.origin + it.href).join("\\n\\n");
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  }

  // Capture on window, so a tap on the stamp doesn't also open the Flyer, its Story or a panel.
  const onKeep = (ev) => {
    const b = ev.target.closest("[data-keep]");
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.type === "click") toggle(Number(b.dataset.keep), b);
  };
  window.addEventListener("click", onKeep, true);
  window.addEventListener("pointerdown", onKeep, true);
  window.addEventListener("keydown", (ev) => {
    const b = ev.target.closest && ev.target.closest(".keep");
    if (b && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ev.stopPropagation(); toggle(Number(b.dataset.keep), b); }
  }, true);
  tab.addEventListener("click", () => { render(); dlg.showModal(); });
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg || ev.target.closest(".x")) return dlg.close();
    const rm = ev.target.closest("[data-rm]");
    if (rm) return toggle(Number(rm.dataset.rm));
    if (ev.target.closest("[data-ics]")) return ics();
    if (ev.target.closest("[data-share]")) return share();
    if (ev.target.closest("[data-clear]") && confirm(L.sure)) { card = []; save(); paint(); render(); }
  });
  // The Story player draws its own stamp; paint it whenever a Story changes.
  const story = document.querySelector(".story .stage");
  if (story) new MutationObserver(paint).observe(story, { childList: true });
  paint();
})();`;

const DANCECARD_CSS = `
  /* the stamp on a Flyer's corner */
  .card .keep { position:absolute; top:10px; right:10px; z-index:3; display:inline-flex; align-items:center; gap:5px; padding:6px 11px 6px 9px;
    border-radius:999px; font-size:12px; font-weight:800; letter-spacing:.02em; color:#fff; cursor:pointer; user-select:none;
    background:rgba(12,10,16,.62); border:1px solid rgba(255,255,255,.22); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);
    box-shadow:0 4px 14px rgba(0,0,0,.35); transition:transform .15s, background .2s; }
  .card .keep i { font-style:normal; font-size:15px; line-height:1; }
  .card .keep:hover { transform:scale(1.05); background:rgba(12,10,16,.8); }
  .card .keep:active { transform:scale(.94); }
  .card .keep.on { background:var(--neon); border-color:transparent; box-shadow:0 0 18px rgba(255,61,139,.55); }
  .card.kept .body { box-shadow:inset 3px 0 0 var(--party); }
  .story .keep { position:absolute; right:16px; bottom:calc(62px + env(safe-area-inset-bottom)); z-index:3; display:inline-flex; gap:5px; align-items:center;
    padding:7px 14px; border-radius:999px; font-size:13px; font-weight:800; color:#fff; cursor:pointer; background:rgba(255,255,255,.18);
    border:1px solid rgba(255,255,255,.3); }
  .story .keep i { font-style:normal; } .story .keep.on { background:var(--neon); border-color:transparent; }

  /* the folded card at the corner, with its tassel */
  .dc-tab { position:fixed; right:16px; bottom:calc(72px + env(safe-area-inset-bottom)); z-index:60; display:flex; align-items:center; gap:8px;
    padding:10px 14px 10px 12px; border:0; border-radius:6px 14px 14px 6px; cursor:pointer; font:italic 700 15px/1 Georgia,"Iowan Old Style","Palatino Linotype",serif;
    color:#3a1f3d; background:linear-gradient(135deg,#fbf5e8,#efe3c8); transform:rotate(-6deg);
    box-shadow:0 10px 26px rgba(0,0,0,.55), inset 0 0 0 1px rgba(160,120,60,.35), inset 4px 0 0 #c2185b; transition:transform .2s; }
  .dc-tab:hover { transform:rotate(-2deg) translateY(-2px); }
  .dc-tab b { font:800 12px/1 system-ui,sans-serif; font-style:normal; min-width:20px; height:20px; line-height:20px; text-align:center; border-radius:10px;
    background:#c2185b; color:#fff; }
  .dc-tab.empty b { background:#b8a98a; }
  .dc-tab i { font-style:normal; font-size:18px; color:#c2185b; }
  .dc-tab .tassel { position:absolute; left:-4px; top:-2px; width:2px; height:26px; background:#c2185b; transform:rotate(18deg); transform-origin:top; }
  .dc-tab .tassel::after { content:""; position:absolute; left:-4px; bottom:-10px; width:10px; height:12px; border-radius:2px 2px 5px 5px;
    background:repeating-linear-gradient(90deg,#c2185b 0 1px,#e0457f 1px 2px); }
  @media (max-width: 599px) { .dc-tab .lbl { display:none; } .dc-tab { padding:12px; } }
  .dc-fly { position:fixed; z-index:200; width:28px; height:28px; line-height:28px; text-align:center; font-size:22px; color:#ff3d8b; pointer-events:none;
    text-shadow:0 0 12px rgba(255,61,139,.8); }

  /* the open card: cream paper, ink and a gilt double frame on the dark floor */
  .dc-sheet { border:0; padding:0; background:none; width:min(440px, calc(100vw - 24px)); max-height:calc(100vh - 32px); overflow:visible; color:#3a1f3d; }
  .dc-sheet::backdrop { background:rgba(6,4,10,.72); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); }
  .dc-sheet[open] { animation:dc-in .35s cubic-bezier(.2,.9,.3,1.2); }
  @keyframes dc-in { from { opacity:0; transform:translateY(40px) rotate(4deg) scale(.92); } }
  .dc-sheet .paper { position:relative; max-height:calc(100vh - 32px); overflow:auto; padding:30px 26px 22px; border-radius:6px; transform:rotate(-.6deg);
    font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;
    background:radial-gradient(120% 80% at 20% 0%, #fffaf0, transparent 60%), radial-gradient(90% 70% at 100% 100%, #eadcbc, transparent 70%), #f6eedc;
    box-shadow:0 30px 80px rgba(0,0,0,.7), inset 0 0 0 8px #f6eedc, inset 0 0 0 9px #b8975a, inset 0 0 0 12px #f6eedc, inset 0 0 0 13px #b8975a,
      inset 0 0 60px rgba(140,100,40,.18); }
  .dc-sheet .orn { position:absolute; font-size:18px; color:#b8975a; line-height:1; }
  .dc-sheet .tl { top:18px; left:20px; } .dc-sheet .tr { top:18px; right:20px; transform:scaleX(-1); }
  .dc-sheet .bl { bottom:16px; left:20px; transform:scaleY(-1); } .dc-sheet .br { bottom:16px; right:20px; transform:scale(-1); }
  .dc-sheet .x { position:absolute; top:22px; right:44px; border:0; background:none; font-size:16px; color:#8a6d4a; cursor:pointer; }
  .dc-sheet .eyebrow { margin:6px 0 0; text-align:center; font-size:11px; letter-spacing:.32em; text-transform:uppercase; color:#a0784a; }
  .dc-sheet h2 { margin:2px 0 0; text-align:center; font-size:40px; font-style:italic; font-weight:400; letter-spacing:-.01em; color:#c2185b; }
  .dc-sheet .count { margin:2px 0 0; text-align:center; font-size:13px; font-style:italic; color:#7a6150; }
  .dc-sheet hr { border:0; height:10px; margin:12px 30px 6px; background:radial-gradient(circle, #b8975a 2px, transparent 2.5px) center / 14px 10px repeat-x; opacity:.7; }
  .dc-sheet ol { list-style:none; margin:0; padding:0 6px; }
  .dc-sheet .dc-day { margin:14px 0 4px; font-size:12px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:#a0784a; }
  .dc-sheet .dc-row { position:relative; display:flex; gap:8px; align-items:flex-start; padding:6px 0; border-bottom:1px solid rgba(160,120,60,.25); }
  .dc-sheet .no { flex:none; width:22px; font-style:italic; color:#a0784a; }
  .dc-sheet .what { flex:1; min-width:0; display:block; }
  .dc-sheet .what .line { display:flex; align-items:flex-end; }
  .dc-sheet .what .ttl { flex:0 1 auto; min-width:0; font-size:16px; font-weight:700; line-height:1.25; }
  .dc-sheet .what .dots { flex:1 0 14px; margin:0 6px 5px; border-bottom:2px dotted rgba(122,97,80,.45); }
  .dc-sheet .what .at { flex:none; font-size:15px; font-style:italic; line-height:1.25; font-variant-numeric:tabular-nums; }
  .dc-sheet .what small { display:block; font-size:12px; color:#7a6150; margin-top:1px; }
  .dc-sheet .what em { font-style:italic; } .dc-sheet .red { display:block; color:#c62828; font-weight:700; }
  .dc-sheet .k-party .ttl { color:#3a1f3d; } .dc-sheet .dc-row::before { content:""; position:absolute; left:-10px; top:11px; width:4px; height:4px; border-radius:50%; background:var(--k); }
  .dc-sheet .past .ttl, .dc-sheet .gone .ttl { text-decoration:line-through; text-decoration-color:#c2185b; text-decoration-thickness:2px; opacity:.6; }
  .dc-sheet .rm { flex:none; border:0; background:none; color:#b8a98a; cursor:pointer; font-size:13px; padding:2px 4px; }
  .dc-sheet .rm:hover { color:#c62828; }
  .dc-sheet .none { margin:18px 10px 10px; text-align:center; font-style:italic; color:#7a6150; line-height:1.5; }
  .dc-sheet .acts { display:flex; flex-wrap:wrap; gap:8px; margin:18px 4px 8px; }
  .dc-sheet .acts button { flex:1; border:1px solid #3a1f3d; background:#3a1f3d; color:#f6eedc; border-radius:999px; padding:9px 12px; cursor:pointer;
    font:700 13px system-ui,sans-serif; white-space:nowrap; }
  .dc-sheet .acts .clr { flex:none; background:none; color:#7a6150; border-color:rgba(122,97,80,.4); }
  @media (max-width: 599px) {
    .dc-sheet { margin:auto 12px 12px; } .dc-sheet h2 { font-size:34px; } .dc-sheet .paper { padding:28px 20px 20px; }
  }
  @media (prefers-reduced-motion: reduce) { .dc-sheet[open] { animation:none; } .dc-tab, .card .keep { transition:none; } }
`;

function Card(props: { f: Filters; o: OnDay; day?: string; wall?: boolean }) {
  const { f, o } = props;
  const { e } = o;
  const when = o.dayN ? `${T[f.lang].day} ${o.dayN}/${o.dayOf}` : timeRange(e);
  if (props.wall) {
    const span = o.dayOf
      ? `${weekdayShort(e.starts_at.slice(0, 10), f.lang)} – ${weekdayShort(e.ends_at!.slice(0, 10), f.lang)}`
      : timeRange(e);
    return (
      <a class={e.cancelled ? "card wall cancelled" : "card wall"} href={href(f, {}, `/events/${e.id}`)} style={glow(e)}>
        {e.flyer_key ? (
          <div class="hero">
            <img src={`/${e.flyer_key}`} alt={`Flyer: ${e.title}`} loading="lazy" />
          </div>
        ) : (
          <div class="hero text">
            <span class="ttl">{e.title}</span>
          </div>
        )}
        <div class="body">
          <div class="ttl">{e.title}</div>
          <div class="meta">
            <b>{span}</b> · <TypeLabel f={f} e={e} />
          </div>
          <div class="meta venue">
            📍 {e.venue}
            {km(e)}
          </div>
          <Tags f={f} e={e} />
          {e.posted_by && e.posted_by !== e.title && <div class="by">{e.posted_by}</div>}
        </div>
      </a>
    );
  }
  return (
    <a class={e.cancelled ? "card cancelled" : "card"} href={href(f, {}, `/events/${e.id}`)} style={glow(e)} data-title={e.title} data-day={props.day ? `${weekdayShort(props.day, f.lang)} ${Number(props.day.slice(8))}.${Number(props.day.slice(5, 7))}.` : ""}>
      {e.flyer_key ? (
        <div class="hero">
          <img src={`/${e.flyer_key}`} alt="Flyer" loading="lazy" />
          <div class="ov">
            <div class="ttl">{e.title}</div>
            {when} · {e.venue}
          </div>
        </div>
      ) : (
        <div class="hero text">
          <span class="ttl">{e.title}</span>
        </div>
      )}
      <div class="body">
        <span class={o.dayN ? "time long" : "time"}>{when}</span>
        <div class="stub">
          <div class="ttl">{e.title}</div>
          <div class="meta">
            <TypeLabel f={f} e={e} /> · {e.venue}
            {km(e)}
          </div>
          <Tags f={f} e={e} />
          {e.posted_by && e.posted_by !== e.title && <div class="by">{e.posted_by}</div>}
        </div>
      </div>
    </a>
  );
}

// The Flyer behind its card, blurred into a halo of its own colours on the dark page.
const glow = (e: Row) => (e.flyer_key ? `--img:url('/${e.flyer_key}')` : undefined);

function CalendarPage(props: { f: Filters; today: string; sel: string; first: string; byDay: Map<string, OnDay[]> }) {
  const { f, today, sel, first, byDay } = props;
  const t = T[f.lang];
  const month = first.slice(0, 7);
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 10);
  };
  const dows = f.lang === "de" ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const list = byDay.get(sel) ?? [];
  return (
    <Page f={f}>
      <FilterBar f={f} />
      <div class="bar">
        <span class="range">{monthName(first, f.lang)}</span>
        <span class="nav">
          <a href={href(f, { d: shift(-1) })}>‹</a> <a href={href(f, { d: shift(1) })}>›</a>
        </span>
      </div>
      <div class="grid">
        {dows.map((d) => (
          <div class="dow">{d}</div>
        ))}
        {[...byDay].map(([d, l]) => {
          const cls = ["cell", d.slice(0, 7) !== month ? "out" : "", d === sel ? "sel" : "", d === today ? "today" : "", d < today ? "past" : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <a class={cls} href={href(f, { d })}>
              <span class="n">{Number(d.slice(8))}</span>
              <span class="dots">
                {l
                  .filter((o) => o.e.type !== "festival")
                  .slice(0, 4)
                  .map((o) => (
                    <span class="dot" style={`background:${o.e.cancelled ? "#bbb" : `var(--${kind(o.e)})`}`} />
                  ))}
              </span>
              {l.some((o) => o.e.type === "festival") && <span class="fest" />}
            </a>
          );
        })}
      </div>
      <h2 class="day">{longDay(sel, f.lang)}</h2>
      {list.length ? (
        list.map(({ e, dayN, dayOf }) => (
          <a class={e.cancelled ? "item cancelled" : "item"} style={`border-left-color:var(--${kind(e)})`} href={href(f, {}, `/events/${e.id}`)}>
            <span class="when">{dayN ? `${t.day} ${dayN}/${dayOf}` : e.starts_at.slice(11)}</span>
            <span>
              <span class="ttl">{e.title}</span>
              <span class="muted">
                <TypeLabel f={f} e={e} /> · {e.venue}
                {km(e)}
              </span>
              <Tags f={f} e={e} />
            </span>
          </a>
        ))
      ) : (
        <p class="empty">{t.none}</p>
      )}
    </Page>
  );
}

// Tap a point, then "Von hier messen" opens the overview with that place, rounded to about a kilometre.
function MapPage(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  const head = (
    <>
      <link rel="stylesheet" href="/vendor/maplibre-gl.css" />
      <script src="/vendor/maplibre-gl.js" />
    </>
  );
  return (
    <Page f={f} title={t.map} head={head}>
      <p class="hint">{t.pick}</p>
      <div id="map" data-center={f.c || "51.43,9.70"} data-zoom={f.c ? "10" : "8"} data-style={MAP_STYLE} data-back={href(f, { c: "" })} />
      <div class="maprow">
        <a class="chip" href={href(f)}>
          ‹ {t.back}
        </a>
        <button id="use" class="chip on" disabled>
          {t.use}
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: MAP_SCRIPT }} />
    </Page>
  );
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const MAP_SCRIPT = `(() => {
  const el = document.getElementById("map"), use = document.getElementById("use");
  const [lat, lng] = el.dataset.center.split(",").map(Number);
  const map = new maplibregl.Map({ container: el, style: el.dataset.style, center: [lng, lat], zoom: Number(el.dataset.zoom) });
  let marker, picked;
  map.on("click", (ev) => {
    picked = ev.lngLat;
    marker = marker || new maplibregl.Marker({ color: "#c2185b" }).setLngLat(picked).addTo(map);
    marker.setLngLat(picked);
    use.disabled = false;
  });
  use.addEventListener("click", () => {
    if (!picked) return;
    const back = el.dataset.back;
    location.href = back + (back.includes("?") ? "&" : "?") + "c=" + picked.lat.toFixed(2) + "," + picked.lng.toFixed(2);
  });
})();`;

function DetailPage(props: { f: Filters; e: Shown }) {
  const { f, e } = props;
  const t = T[f.lang];
  const styles = (JSON.parse(e.styles) as string[]).map((s) => STYLES.find(([k]) => k === s)?.[1] ?? s);
  const date = e.starts_at.slice(0, 10);
  const when =
    e.type === "festival" && e.ends_at
      ? `${longDay(date, f.lang)} – ${longDay(e.ends_at.slice(0, 10), f.lang)}`
      : `${longDay(date, f.lang)}, ${timeRange(e)}`;
  return (
    <Page f={f} title={e.title}>
      <p>
        <a href={href(f)}>‹ {t.back}</a>
      </p>
      <div class={`kind t-${kind(e)}`}>
        <TypeLabel f={f} e={e} />
      </div>
      <h1 class={e.cancelled ? "cancelled" : ""}>
        <span class="ttl">{e.title}</span>
      </h1>
      <Badges f={f} e={e} />
      {e.flyer_key && (
        <div class="flyerbox" style={glow(e)}>
          <img class="flyer" src={`/${e.flyer_key}`} alt="Flyer" />
        </div>
      )}
      <dl class="facts">
        <dt>📅</dt>
        <dd>{when}</dd>
        {e.intro_class_at && (
          <>
            <dt>{t.intro}</dt>
            <dd>{e.intro_class_at.slice(11)}</dd>
          </>
        )}
        {e.level && (
          <>
            <dt>{t.level}</dt>
            <dd>{e.level}</dd>
          </>
        )}
        <dt>{t.venue}</dt>
        <dd>
          {[e.venue, e.address].filter(Boolean).join(", ")}
          {km(e)}
        </dd>
        {e.posted_by && (
          <>
            <dt>{t.by}</dt>
            <dd>{e.posted_by}</dd>
          </>
        )}
        {e.price && (
          <>
            <dt>{t.price}</dt>
            <dd>{e.price}</dd>
          </>
        )}
        {e.rule && (
          <>
            <dt>{t.series}</dt>
            <dd>↻ {ruleWords(JSON.parse(e.rule) as Rule, f.lang)}</dd>
          </>
        )}
        {styles.length > 0 && (
          <>
            <dt>{t.styles}</dt>
            <dd>{styles.join(", ")}</dd>
          </>
        )}
        {e.link && (
          <>
            <dt>{t.link}</dt>
            <dd>
              <a href={e.link} rel="nofollow noopener" style="overflow-wrap:anywhere">
                {e.link}
              </a>
            </dd>
          </>
        )}
      </dl>
      {e.description && <p class="muted desc">{e.description}</p>}
    </Page>
  );
}

function TypeLabel(props: { f: Filters; e: Row }) {
  return <span class={`t-${kind(props.e)}`}>{T[props.f.lang][kind(props.e)]}</span>;
}

function Tags(props: { f: Filters; e: Row }) {
  const { f, e } = props;
  const t = T[f.lang];
  const styles = (JSON.parse(e.styles) as string[]).map((s) => STYLES.find(([k]) => k === s)?.[1] ?? s);
  return (
    <span class="tags">
      {styles.map((s) => (
        <span class="tag">{s}</span>
      ))}
      {e.intro_class_at && (
        <span class="tag">
          🎓 {t.intro} {e.intro_class_at.slice(11)}
        </span>
      )}
      {e.level && <span class="tag">🎓 {e.level}</span>}
      {e.rule && <span class="tag">↻ {ruleWords(JSON.parse(e.rule) as Rule, f.lang)}</span>}
      <Badges f={f} e={e} />
    </span>
  );
}

function Badges(props: { f: Filters; e: Row }) {
  const { e } = props;
  const t = T[props.f.lang];
  return (
    <span class="badges">
      {e.cancelled ? <span class="badge b-cancel">{t.cancelled}</span> : null}
      {e.is_tip ? <span class="badge b-tip">{t.tip}</span> : null}
      {isCourse(e) ? <span class="badge b-reg">{t.reg}</span> : null}
    </span>
  );
}

// ---- Formatting ----

const kind = (e: Row) => (isCourse(e) ? "course" : e.type);
const km = (e: Shown) => (e.km === null ? "" : ` · ${e.km < 10 ? e.km.toFixed(1) : Math.round(e.km)} km`);
const timeRange = (e: Row) => e.starts_at.slice(11) + (e.ends_at && e.type !== "festival" ? `–${e.ends_at.slice(11)}` : "");
const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "en-GB");
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const longDay = (iso: string, lang: Lang) =>
  asDate(iso).toLocaleDateString(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const short = (iso: string, lang: Lang) => asDate(iso).toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (iso: string, lang: Lang) => `${weekdayShort(iso, lang)} ${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}.`;
const weekdayShort = (iso: string, lang: Lang) => asDate(iso).toLocaleDateString(locale(lang), { weekday: "short", timeZone: "UTC" });
const monthName = (iso: string, lang: Lang) => asDate(iso).toLocaleDateString(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" });
const weekday = (iso: string) => asDate(iso).getUTCDay();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(asDate(s).getTime());
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// The Dancer's position, rounded to about a kilometre, opens the same view measured from there. Asked by
// "Mein Standort", and on its own on a page without a place (data-autogeo) unless the browser already
// knows the answer is no; nothing is stored, so a denial just leaves every Event without km.
const GEO_SCRIPT = `(() => {
  const go = (href, fail) => navigator.geolocation.getCurrentPosition((p) => {
    const u = new URL(href, location.href);
    u.searchParams.set("c", p.coords.latitude.toFixed(2) + "," + p.coords.longitude.toFixed(2));
    location.replace(u.pathname + "?" + u.searchParams.toString().replace(/%2C/g, ","));
  }, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  document.querySelectorAll("[data-geo]").forEach((a) => a.addEventListener("click", (ev) => {
    if (!navigator.geolocation) return;
    ev.preventDefault();
    go(a.href, () => { a.textContent = a.dataset.fail; });
  }));
  if (!document.querySelector("[data-autogeo]") || !navigator.geolocation) return;
  const ask = () => go(location.href, () => {});
  if (navigator.permissions) navigator.permissions.query({ name: "geolocation" }).then((s) => { if (s.state !== "denied") ask(); }, ask);
  else ask();
})();`;

// "Nach Acht": the Dancer pages are a dark dance floor and the Flyers are its light. Each Flyer glows in its
// own colours (see glow), the info sits on a ticket stub below it, and the filters float over the feed as
// frosted glass. System fonts only, so no font host learns who looks.
const CSS = `
  :root { color-scheme:dark; --bg:#0c0a10; --card:#18141e; --ink:#f5f0ea; --mute:#a197ab; --line:#2e2738; --seg:#1d1824;
          --party:#ff3d8b; --workshop:#4f9dff; --festival:#ffb02e; --course:#3ddc84; --neon:linear-gradient(95deg,#ff3d8b,#b04bff 55%,#ffb02e); }
  html { background:var(--bg); }
  /* the room lights: the canvas replaces the fixed spotlights once it draws */
  canvas.lights { position:fixed; inset:0; width:100vw; height:100vh; z-index:-1; pointer-events:none; }
  html.lit body { background:transparent; }
  body { color:var(--ink); padding:0 0 1rem; background:
    radial-gradient(42rem 30rem at 0% -8%, rgba(255,61,139,.20), transparent 65%),
    radial-gradient(40rem 32rem at 100% 4%, rgba(124,77,255,.20), transparent 65%),
    radial-gradient(36rem 30rem at 50% 110%, rgba(255,176,46,.10), transparent 70%), var(--bg);
    background-attachment:fixed; -webkit-font-smoothing:antialiased; }
  a { color:inherit; text-decoration:none; }
  ::selection { background:var(--party); color:#fff; }
  :focus-visible { outline:2px solid var(--party); outline-offset:2px; }
  footer { padding:0 16px; color:var(--mute); } footer a { text-decoration:underline; text-decoration-color:var(--line); }
  header.top { display:flex; align-items:center; justify-content:space-between; padding:16px 16px 12px; }
  header.top .home { display:inline-block; font-weight:900; font-style:italic; font-size:26px; line-height:1; letter-spacing:-.035em; text-transform:uppercase;
    background:var(--neon); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 0 14px rgba(255,61,139,.35)); }
  header.top small { display:block; color:var(--mute); font-size:12px; margin-top:4px; letter-spacing:.02em; }
  .lang { border:1px solid var(--line); border-radius:999px; padding:5px 11px; font-size:12px; font-weight:700; color:var(--mute); }
  .filters { position:sticky; top:0; z-index:4; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);
    background:rgba(12,10,16,.72); -webkit-backdrop-filter:blur(18px) saturate(1.6); backdrop-filter:blur(18px) saturate(1.6); }
  .views, .types { display:flex; margin:0 16px 8px; background:var(--seg); border:1px solid var(--line); border-radius:999px; padding:3px; }
  .views a, .types a { flex:1; text-align:center; padding:6px 0; border-radius:999px; font-size:13px; color:var(--mute); transition:color .15s, background .15s; }
  .views a.on, .types a.on { background:var(--ink); color:var(--bg); font-weight:700; }
  .types { margin:8px 16px 0; }
  .chip { display:inline-block; border:1px solid var(--line); background:var(--seg); color:var(--ink); border-radius:999px; padding:5px 12px; font-size:13px; white-space:nowrap; }
  .chip.on { background:var(--neon); color:#fff; border-color:transparent; font-weight:700; box-shadow:0 0 18px rgba(255,61,139,.35); }
  .place { margin:0 16px 6px; }
  .place summary { list-style:none; cursor:pointer; }
  .place summary::-webkit-details-marker { display:none; }
  .place summary.chip.on { background:var(--seg); border-color:var(--line); box-shadow:none; font-weight:600; }
  .place .row { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; align-items:center; }
  .place .label { font-size:12px; color:var(--mute); }
  .hint { margin:0 16px 6px; font-size:12px; color:var(--mute); }
  #map { height:65vh; margin:0 16px; border-radius:16px; overflow:hidden; border:1px solid var(--line); }
  .maprow { display:flex; justify-content:space-between; gap:8px; margin:10px 16px; }
  .maprow button { font:inherit; cursor:pointer; } .maprow button:disabled { opacity:.4; cursor:default; }
  .scroll { display:flex; gap:6px; overflow-x:auto; padding:0 16px; scrollbar-width:none; }
  .bar { display:flex; justify-content:space-between; align-items:center; padding:14px 16px 0; }
  .bar .range { font-weight:800; letter-spacing:-.01em; }
  .bar .nav a, .bar .nav .off { display:inline-block; text-align:center; line-height:30px; border:1px solid var(--line); background:var(--seg); border-radius:50%; width:32px; height:32px; }
  .bar .nav .off { opacity:.35; }
  .strip { display:flex; gap:4px; justify-content:space-between; overflow-x:auto; padding:8px 16px 2px; scrollbar-width:none; }
  .pill { flex:none; width:40px; text-align:center; border-radius:12px; background:var(--card); border:1px solid var(--line); padding:4px 0; font-size:11px; }
  .pill b { display:block; font-size:16px; }
  .pill.none { opacity:.35; }
  .pill .cnt { display:inline-block; min-width:16px; border-radius:8px; background:var(--party); color:#fff; font-size:10px; }
  h2.day { padding:28px 16px 6px; margin:0; font-size:15px; font-weight:700; color:var(--mute); letter-spacing:.01em; scroll-margin-top:190px;
    display:flex; align-items:center; gap:10px; }
  h2.day::after { content:""; flex:1; height:1px; background:linear-gradient(90deg, var(--line), transparent); }
  h2.day.today { color:var(--ink); }
  h2.day .now { font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; color:#fff; background:var(--party); padding:3px 9px;
    border-radius:999px; box-shadow:0 0 16px rgba(255,61,139,.6); animation:pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow:0 0 4px rgba(255,61,139,.2); } }

  /* The card: the whole Flyer, its colours bleeding into the floor, then a ticket stub */
  .card { position:relative; isolation:isolate; display:block; margin:10px 16px 26px; border-radius:18px; background:none; }
  .card::before { content:""; position:absolute; z-index:-1; inset:3% -12px -14px; border-radius:30px; opacity:.75; transition:opacity .25s;
    background:var(--img, linear-gradient(135deg,#3949ab,#8e24aa)) center / cover; filter:blur(34px) saturate(1.8); }
  .card:hover::before, .card:focus-visible::before { opacity:1; }
  .hero { position:relative; background:#000; border-radius:18px 18px 0 0; overflow:hidden; }
  .hero img { display:block; width:100%; max-height:70vh; object-fit:cover; object-position:top; }
  .hero.text { background:linear-gradient(135deg,#3949ab,#8e24aa); color:#fff; font-size:26px; font-weight:900; font-style:italic; text-transform:uppercase;
    letter-spacing:-.02em; text-align:center; padding:48px 20px; }
  .ov { display:none; }
  .card .body { position:relative; display:flex; gap:14px; align-items:flex-start; padding:14px 16px 15px; font-size:13px; color:var(--mute);
    background:var(--card); border-radius:0 0 18px 18px; border-top:2px dashed rgba(255,255,255,.12); }
  /* the ticket's notches */
  .card .body::before, .card .body::after { content:""; position:absolute; top:-11px; width:20px; height:20px; border-radius:50%; background:var(--bg); }
  .card .body::before { left:-10px; } .card .body::after { right:-10px; }
  .card .time { flex:none; min-width:64px; font-size:26px; font-weight:900; line-height:1; letter-spacing:-.03em; color:var(--ink); font-variant-numeric:tabular-nums; }
  .card .time.long { font-size:15px; line-height:1.3; }
  .card .stub { min-width:0; }
  .card .stub .ttl { font-size:16px; font-weight:800; line-height:1.2; color:var(--ink); margin-bottom:2px; }
  .card .by { color:var(--mute); margin-top:6px; font-size:12px; opacity:.8; }
  .card.cancelled .hero { filter:grayscale(1) brightness(.5); } .card.cancelled::before { opacity:.12; filter:blur(30px) grayscale(1); }
  .cancelled .ttl { text-decoration:line-through; }
  .tags { display:inline; }
  .tag { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.08); color:#d8cfe2; margin:5px 4px 0 0; }
  .badge { display:inline-block; font-size:11px; padding:2px 7px; border-radius:6px; font-weight:700; margin:5px 4px 0 0; }
  .b-cancel { background:rgba(255,80,80,.16); color:#ff8a8a; } .b-tip { background:rgba(79,157,255,.16); color:#8fc0ff; } .b-reg { background:rgba(61,220,132,.14); color:#7fe8ad; }
  .t-party{color:var(--party)} .t-workshop{color:var(--workshop)} .t-festival{color:var(--festival)} .t-course{color:var(--course)}
  .t-party, .t-workshop, .t-festival, .t-course { font-weight:700; }
  .muted { color:var(--mute); }
  .empty { padding:60px 16px; text-align:center; color:var(--mute); }
  .grid { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; padding:8px 8px 0; }
  .dow { text-align:center; font-size:11px; color:var(--mute); padding:4px 0; }
  .cell { background:var(--card); min-height:50px; border-radius:8px; padding:3px; font-size:12px; position:relative; border:2px solid transparent; }
  .cell.out { opacity:.35; } .cell.past { opacity:.5; } .cell.sel { border-color:var(--party); box-shadow:0 0 14px rgba(255,61,139,.35); }
  .cell.today .n { background:var(--party); color:#fff; border-radius:50%; }
  .cell .n { display:inline-block; width:20px; text-align:center; }
  .cell .dots { display:flex; gap:2px; flex-wrap:wrap; margin-top:2px; }
  .cell .dot { width:7px; height:7px; border-radius:50%; }
  .cell .fest { position:absolute; left:-2px; right:-2px; bottom:3px; height:5px; background:var(--festival); }
  .item { display:flex; gap:12px; background:var(--card); border-radius:14px; padding:12px; margin:0 16px 8px; border-left:4px solid var(--line); }
  .item .when { font-weight:900; min-width:56px; font-variant-numeric:tabular-nums; }
  .item .ttl, .item .muted { display:block; }
  .item .ttl { font-weight:700; } .item .muted { font-size:13px; }
  .kind { font-size:12px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:0 16px; }
  h1 { margin:4px 16px; font-size:28px; font-weight:900; line-height:1.1; letter-spacing:-.02em; }
  .badges { padding:0 0 0 0; }
  body > .badges, h1 + .badges { display:block; padding:0 16px; }
  .flyerbox { position:relative; isolation:isolate; margin:16px 16px 18px; }
  .flyerbox::before { content:""; position:absolute; z-index:-1; inset:4%; background:var(--img) center / cover; filter:blur(40px) saturate(1.7); opacity:.7; }
  .flyer { display:block; width:100%; border-radius:14px; }
  .facts { display:grid; grid-template-columns:auto 1fr; gap:8px 14px; margin:10px 16px; padding:14px 16px; font-size:14px; background:var(--card); border-radius:16px; border:1px solid var(--line); }
  .facts dt { color:var(--mute); } .facts dd { margin:0; }
  .desc { margin:14px 16px; white-space:pre-line; }
  body > p { margin:10px 16px; }
  body > p > a { color:var(--mute); }
  @media (prefers-reduced-motion: reduce) { h2.day .now { animation:none; } .card::before { transition:none; } }
`;
