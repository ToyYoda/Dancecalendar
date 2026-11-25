import { Hono } from "hono";
import { Layout } from "./layout";
import { Masthead, SITE_CSS } from "./site";
import { addDays, ruleWords, type Rule } from "./series";
import { berlinDate } from "./whatsapp/bot";

// The Dancer overview at "/" (what Stepdate is: /ueber): the Events of a span of days as a list by day
// (the default: today and the next 7 days) or on a map (?view=map). Above both, a small month calendar shows
// which days have something on and picks the span (a first and a last day, or Von/Bis); beside them one
// sidebar of filters. All of it stays in the URL (and is subscribable at /kalender.ics), so a link shows the same view on
// any phone. No accounts, no cookies. Distances are measured from the Dancer's position (the browser is
// asked on a visit without one) or a place picked on the map at /karte; without either, every Event shows
// and no km. Decisions: .scratch/dance-calendar-mvp/issues/07-dancer-overview-prototype.md (variant D),
// 10-region-boundary.md, 23-dancer-overview.md and 33-distance-from-my-position.md.

type Lang = "de" | "en";

// URL parameters, all optional:
// c = "lat,lng" (without it: no distances, every Event), r = 10|25|50|100|all (default 50, only with c),
// styles = salsa,bachata,…, type = party|workshop|course|festival, view = map, von and bis = the first and last day
// shown, m = the month the small calendar shows (YYYY-MM, else von's month), lang = en. Older links' w (a week)
// and d (one day) still open that span.
type Filters = { c: string; r: string; styles: string[]; type: string; view: string; von: string; bis: string; m: string; lang: Lang };

const DEFAULT_DAYS = 8; // today and the next 7 days
const MAX_DAYS = 92;

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
    series: "Serie", link: "Link", styles: "Tanz", day: "Tag", feed: "Liste", back: "Zurück",
    from: "Von", to: "Bis", show: "Zeigen", span: "Zeitraum", nextDays: "Nächste 7 Tage", pickHint: "Tippe den ersten und den letzten Tag.", pickEnd: "Jetzt den letzten Tag tippen.", busy: "Events",
    today: "Heute", sub: "wo heute getanzt wird", about: "Was ist Stepdate?",
    filters: "Filter", week: "KW", prev: "Früher", next: "Später", view: "Ansicht", mapView: "Karte", unplaced: "Nicht auf der Karte", noCoords: "Diese Orte haben noch keine Koordinaten.",
    subscribe: "Abonnieren", subHint: "Die Events mit diesen Filtern erscheinen in deiner Kalender-App und bleiben dort von selbst aktuell.",
    openApp: "In Kalender-App öffnen", copy: "Link kopieren", copied: "Link kopiert",
  },
  en: {
    all: "All", party: "Party", workshop: "Workshop", course: "Course", festival: "Festival",
    parties: "Parties", workshops: "Workshops", courses: "Courses", festivals: "Festivals",
    anywhere: "anywhere", me: "My location", noGeo: "Location not available", map: "Pick on map", here: "From here",
    noPlace: "All places", hint: "For distances: allow your location or pick a place on the map.",
    pick: "Tap the map to pick the place.", use: "Measure from here",
    radius: "Radius", none: "No events for these filters.", cancelled: "Cancelled", tip: "added by the community",
    reg: "Registration required", intro: "Intro class", level: "Level", price: "Price", venue: "Venue", by: "Organized by",
    series: "Series", link: "Link", styles: "Style", day: "Day", feed: "List", back: "Back",
    from: "From", to: "To", show: "Show", span: "Dates", nextDays: "Next 7 days", pickHint: "Tap the first and the last day.", pickEnd: "Now tap the last day.", busy: "events",
    today: "Today", sub: "where to dance tonight", about: "What is Stepdate?",
    filters: "Filters", week: "Week", prev: "Earlier", next: "Later", view: "View", mapView: "Map", unplaced: "Not on the map", noCoords: "These places have no coordinates yet.",
    subscribe: "Subscribe", subHint: "The Events for these filters show up in your calendar app and stay up to date there on their own.",
    openApp: "Open in calendar app", copy: "Copy link", copied: "Link copied",
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
  const [from, to] = span(f, today);
  const days = range(from, daysBetween(from, to) + 1);
  const month = /^\d{4}-\d{2}$/.test(f.m) ? f.m : from.slice(0, 7);
  const grid = monthGrid(month);
  // One query for the listed days and the small calendar's month.
  const all = range(grid[0] < from ? grid[0] : from, daysBetween(grid[0] < from ? grid[0] : from, grid.at(-1)! > to ? grid.at(-1)! : to) + 1);
  const byAll = await eventsByDay(c.env.DB, f, all);
  const byDay = new Map(days.map((d) => [d, byAll.get(d) ?? []]));
  const busy = new Set(grid.filter((d) => byAll.get(d)?.length));
  return c.html(<FeedPage f={f} today={today} from={from} to={to} month={month} grid={grid} busy={busy} byDay={byDay} />);
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

// The subscription: the same filters as an iCalendar feed (RFC 5545) that calendar apps fetch again on
// their own, so the chosen Events stay current there. The URL holds nothing but the filters (a place
// rounded to about a kilometre); no account, nothing stored. From a week back to half a year ahead.
overview.get("/kalender.ics", async (c) => {
  const url = new URL(c.req.url);
  const f = filters(url.searchParams);
  const today = berlinDate(new Date());
  const [from, to] = [addDays(today, -7), addDays(today, 183)];
  const { results } = await c.env.DB
    .prepare(`${SELECT} WHERE e.starts_at < ? AND (e.starts_at >= ? OR (e.type = 'festival' AND e.ends_at >= ?)) ORDER BY e.starts_at`)
    .bind(to, from, from)
    .all<Row>();
  const shown = results.map((row) => ({ ...row, km: distance(row, f) })).filter((e) => matches(e, f));
  return c.body(calendar(shown, f, url.origin), 200, {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": 'inline; filename="dancecalendar.ics"',
    "cache-control": "public, max-age=900",
  });
});

function calendar(events: Shown[], f: Filters, origin: string): string {
  const t = T[f.lang];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const picked = [
    ...STYLES.filter(([k]) => f.styles.includes(k)).map(([, n]) => n),
    ...(f.type ? [t[PLURAL[f.type as keyof typeof PLURAL]]] : []),
  ];
  const name = ["Stepdate", ...(picked.length ? [picked.join(", ")] : [])].join(" · ");
  const local = (iso: string) => iso.replace(/[-:]/g, "") + "00";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stepdate//Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(name)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...BERLIN,
  ];
  for (const e of events) {
    const link = `${origin}/events/${e.id}${f.lang === "en" ? "?lang=en" : ""}`;
    const about = [
      [t[kind(e)], ...styleNames(e)].join(" · "),
      e.intro_class_at && `${t.intro} ${e.intro_class_at.slice(11)}`,
      e.level,
      e.price && `${t.price}: ${e.price}`,
      e.posted_by && e.posted_by !== e.title && `${t.by} ${e.posted_by}`,
      e.is_tip ? t.tip : null,
      link,
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:event-${e.id}@${new URL(origin).hostname}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Berlin:${local(e.starts_at)}`,
      ...(e.ends_at && e.ends_at > e.starts_at ? [`DTEND;TZID=Europe/Berlin:${local(e.ends_at)}`] : []),
      `SUMMARY:${text(e.cancelled ? `${t.cancelled}: ${e.title}` : e.title)}`,
      `LOCATION:${text([e.venue, e.address].filter(Boolean).join(", "))}`,
      ...(e.lat !== null && e.lng !== null ? [`GEO:${e.lat};${e.lng}`] : []),
      `DESCRIPTION:${text(about.join("\n"))}`,
      `URL:${link}`,
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Europe/Berlin's rules, so every app reads the wall-clock times the same way.
const BERLIN = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets continue on the next line after one space, never inside a character.
function fold(line: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// ---- Filters ----

function filters(p: URLSearchParams): Filters {
  const list = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  const c = p.get("c") ?? "";
  const r = p.get("r") ?? "";
  let von = p.get("von") ?? "";
  let bis = p.get("bis") ?? "";
  const w = p.get("w") ?? "";
  const d = p.get("d") ?? "";
  if (!isDate(von) && isDate(w)) [von, bis] = [addDays(w, -((weekday(w) + 6) % 7)), addDays(w, 6 - ((weekday(w) + 6) % 7))];
  if (!isDate(von) && isDate(d)) [von, bis] = [d, d];
  return {
    c: coordinates(c) ? c : "",
    r: RADII.includes(r) ? r : "",
    styles: list("styles").filter((s) => STYLES.some(([k]) => k === s)),
    type: (TYPES as readonly string[]).includes(p.get("type") ?? "") ? p.get("type")! : "",
    view: p.get("view") === "map" ? "map" : "",
    von: isDate(von) ? von : "",
    bis: isDate(von) && isDate(bis) ? bis : "",
    m: /^\d{4}-\d{2}$/.test(p.get("m") ?? "") ? p.get("m")! : "",
    lang: p.get("lang") === "en" ? "en" : "de",
  };
}

// The days shown: von to bis (in either order, at most MAX_DAYS), von alone is one day, neither is the default.
function span(f: Filters, today: string): [string, string] {
  if (!f.von) return [today, addDays(today, DEFAULT_DAYS - 1)];
  const [a, b] = f.bis && f.bis < f.von ? [f.bis, f.von] : [f.von, f.bis || f.von];
  return [a, daysBetween(a, b) >= MAX_DAYS ? addDays(a, MAX_DAYS - 1) : b];
}

// The small calendar's days: whole weeks from the Monday before the 1st to the Sunday after the last day.
function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const end = addDays(last, (7 - weekday(last)) % 7);
  return range(start, daysBetween(start, end) + 1);
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
  if (g.von) p.set("von", g.von);
  if (g.von && g.bis && g.bis !== g.von) p.set("bis", g.bis);
  if (g.m) p.set("m", g.m);
  if (g.lang === "en") p.set("lang", "en");
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
                       e.description, e.cancelled, e.is_tip, e.flyer_key, COALESCE(o.name, e.shown_as) AS posted_by,
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
// PROTOTYPE (taste-skill redesign): the Dancer pages in the landing page's look. A light app bar, the filters
// as pills in a sticky bar, and each day's date beside its Events, each Event a card. The Flyers stand whole
// in their card, never cropped or covered. One teal marks today, each Event's type and what a filter has
// picked. The font comes from this site, so no font host learns who looks.

function Page(props: { f: Filters; title?: string; head?: any; children: any }) {
  const t = T[props.f.lang];
  const head = (
    <>
      <link rel="preload" href="/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {props.head}
    </>
  );
  return (
    <Layout title={props.title ? `${props.title} – Stepdate` : "Stepdate"} lang={props.f.lang} head={head}>
      <Masthead lang={props.f.lang} home={href(props.f, { von: "", bis: "", m: "" })} add ink>
        <a class="about" href="/ueber" lang="de">{t.about}</a>
        <a class="lang" href={href(props.f, { lang: props.f.lang === "de" ? "en" : "de" })} lang={props.f.lang === "de" ? "en" : "de"}>
          {props.f.lang === "de" ? "English" : "Deutsch"}
        </a>
      </Masthead>
      {props.children}
      <script dangerouslySetInnerHTML={{ __html: GEO_SCRIPT }} />
    </Layout>
  );
}

const Arrow = (props: { back?: boolean }) => (
  <svg class="arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d={props.back ? "M8.5 2.5 4 7l4.5 4.5" : "M5.5 2.5 10 7l-4.5 4.5"} fill="none" stroke="currentColor" stroke-width="1.6" />
  </svg>
);

const Chevron = () => (
  <svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" />
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 3.5h12M2 8h12M2 12.5h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);

const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 14.5s4.5-4.2 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.7 4.5 7.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    <circle cx="8" cy="6.8" r="1.6" fill="currentColor" />
  </svg>
);

const FeedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M2 6.5h12M8 8.5v3.5M6.2 10.3 8 12.1l1.8-1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// The calendar's frame: the sidebar with the view, the place, the styles and the subscription, beside
// the pane with the dates, the type tabs and the Events. On a phone the sidebar folds into a sticky bar
// of menus above the pane. Every choice is a link, so it works without script and stays in the URL.
function Shell(props: { f: Filters; children: any }) {
  return (
    <div class="app">
      <Sidebar f={props.f} />
      <main class="pane">{props.children}</main>
    </div>
  );
}

function Sidebar(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  const r = f.r || DEFAULT_RADIUS;
  const toggleStyle = (s: string) => (f.styles.includes(s) ? f.styles.filter((x) => x !== s) : [...f.styles, s]);
  const boxes = STYLES.map(([k, name]) => (
    <a class={f.styles.includes(k) ? "box on" : "box"} href={href(f, { styles: toggleStyle(k) })} role="checkbox" aria-checked={f.styles.includes(k) ? "true" : "false"}>
      <i aria-hidden="true" />
      {name}
    </a>
  ));
  const picked = STYLES.filter(([k]) => f.styles.includes(k)).map(([, name]) => name);
  const feed = href({ ...f, view: "", von: "", bis: "", m: "" }, {}, "/kalender.ics");
  return (
    <aside class="side" aria-label={t.filters}>
      <div class="views" aria-label={t.view}>
        <a class={f.view ? "" : "on"} href={href(f, { view: "" })} aria-current={f.view ? undefined : "page"}>
          <ListIcon />
          {t.feed}
        </a>
        <a class={f.view === "map" ? "on" : ""} href={href(f, { view: "map" })} aria-current={f.view === "map" ? "page" : undefined}>
          <PinIcon />
          {t.mapView}
        </a>
      </div>
      <span class="br" aria-hidden="true" />
      <div class="grp place">
        <p class="lbl">{t.venue}</p>
        <details class="pick place" {...(f.c ? {} : { "data-autogeo": "" })}>
          <summary class={f.c ? "set" : ""}>
            {!f.c ? t.noPlace : r === "all" ? `${t.here} · ${t.anywhere}` : `${t.here} · ${r} km`}
            <Chevron />
          </summary>
          <div class="menu">
            {!f.c && <p class="hint">{t.hint}</p>}
            <div class="opts">
              <a class="opt" href={href(f, { c: "" })} data-geo data-fail={t.noGeo}>
                {t.me}
              </a>
              <a class="opt" href={href(f, {}, "/karte")}>
                {t.map}
              </a>
            </div>
            {f.c && (
              <div class="opts">
                <span class="lbl">{t.radius}</span>
                {RADII.map((x) => (
                  <a class={r === x ? "opt on" : "opt"} href={href(f, { r: x })}>
                    {x === "all" ? t.anywhere : `${x} km`}
                  </a>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>
      <div class="grp styles-open">
        <p class="lbl">{t.styles}</p>
        {boxes}
      </div>
      <details class="pick styles">
        <summary class={picked.length ? "set" : ""}>
          {!picked.length ? t.styles : picked.length === 1 ? picked[0] : `${picked[0]} +${picked.length - 1}`}
          <Chevron />
        </summary>
        <div class="menu">{boxes}</div>
      </details>
      <details class="pick abo">
        <summary>
          <FeedIcon />
          <span class="abo-t">{t.subscribe}</span>
        </summary>
        <div class="menu">
          <p class="hint">{t.subHint}</p>
          <a class="btn solid" href={feed} data-webcal>
            {t.openApp}
          </a>
          <button class="btn" type="button" data-copy={feed} data-done={t.copied} hidden>
            {t.copy}
          </button>
        </div>
      </details>
      <script dangerouslySetInnerHTML={{ __html: SIDE_SCRIPT }} />
    </aside>
  );
}

// A tap elsewhere closes a menu; the sticky bar's height keeps day anchors clear of it on a phone; the
// subscribe link opens the calendar app (webcal:), and the copy button puts the feed's https address on
// the clipboard for apps that ask for one.
const SIDE_SCRIPT = `document.addEventListener("click",(e)=>document.querySelectorAll(".side .pick[open]").forEach((d)=>{if(!d.contains(e.target))d.open=false;}));
(()=>{const n=document.querySelector(".side");if(!n)return;const s=()=>document.documentElement.style.setProperty("--stick",(innerWidth<860?n.offsetHeight:0)+"px");s();addEventListener("resize",s);
document.querySelectorAll("[data-webcal]").forEach((a)=>{a.href="webcal://"+location.host+a.getAttribute("href");});
document.querySelectorAll("[data-copy]").forEach((b)=>{if(!navigator.clipboard)return;b.hidden=false;b.addEventListener("click",()=>navigator.clipboard.writeText(location.origin+b.dataset.copy).then(()=>{b.textContent=b.dataset.done;}));});})();`;

function TypeTabs(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  return (
    <nav class="types" aria-label={t.filters}>
      <a class={f.type ? "" : "on"} href={href(f, { type: "" })} aria-current={f.type ? undefined : "true"}>
        {t.all}
      </a>
      {TYPES.map((k) => (
        <a class={f.type === k ? "on" : ""} href={href(f, { type: k })} aria-current={f.type === k ? "true" : undefined}>
          {t[PLURAL[k]]}
        </a>
      ))}
    </nav>
  );
}

function FeedPage(props: { f: Filters; today: string; from: string; to: string; month: string; grid: string[]; busy: Set<string>; byDay: Map<string, OnDay[]> }) {
  const { f, today, from, to, byDay } = props;
  const t = T[f.lang];
  const any = [...byDay.values()].some((l) => l.length);
  return (
    <Page f={f} head={f.view === "map" ? MAP_HEAD : undefined}>
      <Shell f={f}>
        <SpanPicker {...props} />
        <h2 class="range">{from === to ? longDay(from, f.lang) : `${short(from, f.lang)} – ${short(to, f.lang)}`}</h2>
        <TypeTabs f={f} />
        {f.view === "map" ? (
          <EventMap f={f} today={today} byDay={byDay} />
        ) : (
          <>
            {[...byDay].map(([d, list]) => (list.length ? <Day f={f} d={d} today={today} list={list} /> : null))}
            {!any && <p class="empty">{t.none}</p>}
          </>
        )}
      </Shell>
    </Page>
  );
}

// The small month calendar above the list and the map: a dot under each day with something on, the shown
// span marked. Without script a tap shows that day; with it the first tap marks the first day and the
// second the last. Von and Bis pick the span exactly; it stays when switching between list and map.
function SpanPicker(props: { f: Filters; today: string; from: string; to: string; month: string; grid: string[]; busy: Set<string> }) {
  const { f, today, from, to, month, grid, busy } = props;
  const t = T[f.lang];
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  };
  const dows = f.lang === "de" ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const isDefault = !f.von;
  const keep: [string, string][] = [
    ["view", f.view],
    ["c", f.c],
    ["r", f.r],
    ["styles", f.styles.join(",")],
    ["type", f.type],
    ["lang", f.lang === "en" ? "en" : ""],
  ];
  return (
    <section class="spanpick" aria-label={t.span}>
      <div class="mini" data-mini>
        <div class="mhead">
          <a href={href(f, { m: shift(-1) })} aria-label={t.prev}><Arrow back /></a>
          <span>{monthName(`${month}-01`, f.lang)}</span>
          <a href={href(f, { m: shift(1) })} aria-label={t.next}><Arrow /></a>
        </div>
        <div class="mgrid" role="grid">
          {dows.map((d) => (
            <span class="dow" role="columnheader">{d}</span>
          ))}
          {grid.map((d) => {
            const cls = [
              "c",
              d.slice(0, 7) !== month ? "out" : "",
              d < today ? "past" : "",
              d === today ? "today" : "",
              busy.has(d) ? "busy" : "",
              d >= from && d <= to ? "in" : "",
              d === from ? "first" : "",
              d === to ? "last" : "",
            ].filter(Boolean).join(" ");
            return (
              <a class={cls} href={href(f, { von: d, bis: "", m: "" })} data-day={d} aria-label={`${longDay(d, f.lang)}${busy.has(d) ? ` · ${t.busy}` : ""}`} aria-current={d >= from && d <= to ? "date" : undefined}>
                {Number(d.slice(8))}
              </a>
            );
          })}
        </div>
        <p class="hint" data-mini-hint data-end={t.pickEnd} aria-live="polite">{t.pickHint}</p>
      </div>
      <form class="dates" method="get" action="/">
        {keep.filter(([, v]) => v).map(([k, v]) => (
          <input type="hidden" name={k} value={v} />
        ))}
        <label>
          {t.from}
          <input type="date" name="von" value={from} required />
        </label>
        <label>
          {t.to}
          <input type="date" name="bis" value={to} min={from} />
        </label>
        <button class="btn" type="submit">{t.show}</button>
        {!isDefault && <a class="reset" href={href(f, { von: "", bis: "", m: "" })}>{t.nextDays}</a>}
      </form>
      <script dangerouslySetInnerHTML={{ __html: SPAN_SCRIPT }} />
    </section>
  );
}

// Two taps pick a span: the first marks its first day, hovering shows the span, the second opens it.
// Changing Von or Bis opens the new span at once.
const SPAN_SCRIPT = `(() => {
  const box = document.querySelector("[data-mini]"), hint = document.querySelector("[data-mini-hint]");
  if (!box) return;
  let first = null;
  const cells = [...box.querySelectorAll("a[data-day]")];
  const mark = (a, b) => cells.forEach((c) => c.classList.toggle("pend", !!a && c.dataset.day >= a && c.dataset.day <= b));
  box.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[data-day]");
    if (!a) return;
    ev.preventDefault();
    const d = a.dataset.day;
    if (!first) { first = d; mark(d, d); hint.textContent = hint.dataset.end; return; }
    const [von, bis] = d < first ? [d, first] : [first, d];
    const u = new URL(a.href, location.href);
    u.searchParams.set("von", von);
    if (bis !== von) u.searchParams.set("bis", bis); else u.searchParams.delete("bis");
    location.href = u.pathname + "?" + u.searchParams.toString().replace(/%2C/g, ",");
  });
  box.addEventListener("mouseover", (ev) => {
    const a = first && ev.target.closest("a[data-day]");
    if (a) mark(a.dataset.day < first ? a.dataset.day : first, a.dataset.day < first ? first : a.dataset.day);
  });
  const form = document.querySelector(".spanpick .dates");
  form && form.classList.add("auto");
  form && form.addEventListener("change", () => { const v = form.elements.von.value, b = form.elements.bis.value; if (v && (!b || b >= v)) form.submit(); });
})();`;

// The week's Events on a map: one pin per Venue with its count, a tap lists that Venue's Events with links.
// Like the place picker, only this view loads MapLibre (from this site) and tiles from OpenFreeMap.
// Events at a Venue without coordinates follow below the map as rows, so none goes missing.
function EventMap(props: { f: Filters; today: string; byDay: Map<string, OnDay[]> }) {
  const { f, today, byDay } = props;
  const t = T[f.lang];
  type Pin = { name: string; lat: number; lng: number; events: { id: number; when: string; title: string; kind: string; href: string; off: boolean }[] };
  const pins = new Map<string, Pin>();
  const unplaced = new Map<string, OnDay[]>();
  for (const [d, list] of byDay) {
    for (const o of list) {
      const { e } = o;
      if (e.lat === null || e.lng === null) {
        unplaced.set(d, [...(unplaced.get(d) ?? []), o]);
        continue;
      }
      const key = `${e.lat},${e.lng}`;
      const pin = pins.get(key) ?? { name: e.venue, lat: e.lat, lng: e.lng, events: [] };
      pins.set(key, pin);
      if (pin.events.some((x) => x.id === e.id)) continue; // a Festival once, on its first day this week
      const time = o.dayN ? `${t.day} ${o.dayN}/${o.dayOf}` : timeRange(e);
      pin.events.push({
        id: e.id,
        when: `${d === today ? t.today : weekdayShort(d, f.lang)} ${Number(d.slice(8))}.${Number(d.slice(5, 7))}. · ${time}`,
        title: e.title,
        kind: e.cancelled ? t.cancelled : t[kind(e)],
        href: href(f, {}, `/events/${e.id}`),
        off: e.cancelled === 1,
      });
    }
  }
  const here = coordinates(f.c);
  const data = { style: MAP_STYLE, here: here && [here.lat, here.lng], pins: [...pins.values()] };
  return (
    <>
      <div id="evmap" class="evmap" role="region" aria-label={t.mapView} />
      {!pins.size && !unplaced.size && <p class="empty">{t.none}</p>}
      <script type="application/json" id="evmap-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
      <script dangerouslySetInnerHTML={{ __html: EVMAP_SCRIPT }} />
      {unplaced.size > 0 && (
        <section class="unplaced" aria-labelledby="h-unplaced">
          <h2 id="h-unplaced">{t.unplaced}</h2>
          <p class="hint">{t.noCoords}</p>
          {[...unplaced].map(([d, list]) => (
            <Day f={f} d={d} today={today} list={list} />
          ))}
        </section>
      )}
    </>
  );
}

const MAP_HEAD = (
  <>
    <link rel="stylesheet" href="/vendor/maplibre-gl.css" />
    <script src="/vendor/maplibre-gl.js" />
  </>
);

const EVMAP_SCRIPT = `(() => {
  const el = document.getElementById("evmap"), data = JSON.parse(document.getElementById("evmap-data").textContent);
  if (!el || !window.maplibregl) return;
  const map = new maplibregl.Map({ container: el, style: data.style, center: [9.7, 51.43], zoom: 8, attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const count = (ps) => ps.reduce((n, p) => n + p.events.length, 0);
  // One Venue's Events, from text nodes only (no innerHTML), so a title can never become markup.
  const venue = (p) => {
    const box = node("div", "venue");
    box.append(node("b", "", p.name));
    p.events.forEach((e) => {
      const a = node("a", e.off ? "off" : "");
      a.href = e.href;
      a.append(node("span", "", e.when), node("strong", "", e.title), node("small", "", e.kind));
      box.append(a);
    });
    return box;
  };
  const popup = (ps) => { const box = node("div", "pop"); ps.forEach((p) => box.append(venue(p))); return new maplibregl.Popup({ offset: 20, maxWidth: "290px" }).setDOMContent(box); };
  // Pins closer than this on screen join one group pin with their total; a tap on a group zooms in until
  // it falls apart, or, once zoomed in close (Venues in one building), lists all of them.
  const NEAR = 46;
  let markers = [];
  const draw = () => {
    markers.forEach((m) => m.remove());
    markers = [];
    const groups = [];
    data.pins.forEach((p) => {
      const pt = map.project([p.lng, p.lat]);
      const g = groups.find((g) => Math.hypot(g.x - pt.x, g.y - pt.y) < NEAR);
      if (g) { g.pins.push(p); g.x = (g.x * (g.pins.length - 1) + pt.x) / g.pins.length; g.y = (g.y * (g.pins.length - 1) + pt.y) / g.pins.length; }
      else groups.push({ x: pt.x, y: pt.y, pins: [p] });
    });
    groups.forEach((g) => {
      const many = g.pins.length > 1;
      const off = g.pins.every((p) => p.events.every((e) => e.off));
      const pin = node("button", "pin" + (many ? " group" : "") + (off ? " off" : ""), String(count(g.pins)));
      pin.type = "button";
      pin.setAttribute("aria-label", many ? g.pins.map((p) => p.name).join(", ") + ": " + count(g.pins) : g.pins[0].name + ": " + count(g.pins));
      const at = many ? map.unproject([g.x, g.y]) : [g.pins[0].lng, g.pins[0].lat];
      const m = new maplibregl.Marker({ element: pin }).setLngLat(at);
      if (many && map.getZoom() < 15) {
        pin.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const b = new maplibregl.LngLatBounds();
          g.pins.forEach((p) => b.extend([p.lng, p.lat]));
          map.fitBounds(b, { padding: 90, maxZoom: 16 });
        });
      } else {
        m.setPopup(popup(g.pins));
      }
      markers.push(m.addTo(map));
    });
  };
  if (data.here) new maplibregl.Marker({ element: node("span", "here") }).setLngLat([data.here[1], data.here[0]]).addTo(map);
  const bounds = new maplibregl.LngLatBounds();
  data.pins.forEach((p) => bounds.extend([p.lng, p.lat]));
  if (data.here) bounds.extend([data.here[1], data.here[0]]);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 });
  draw();
  map.on("zoomend", draw);
})();`;

// A day's heading with its count, then one row per Event.
function Day(props: { f: Filters; d: string; today: string; list: OnDay[] }) {
  const { f, d, today, list } = props;
  const t = T[f.lang];
  return (
    <section class={d === today ? "day today" : "day"} id={`day-${d}`} aria-labelledby={`h-${d}`}>
      <header class="dayhead">
        <h2 id={`h-${d}`}>
          {longWeekday(d, f.lang)} <span class="date">{dayMonth(d, f.lang)}</span>
          {d === today && <span class="now">{t.today}</span>}
        </h2>
        <span class="count">
          {list.length} {list.length === 1 ? "Event" : "Events"}
        </span>
      </header>
      <div class="rows">
        {list.map((o) => (
          <Entry f={f} o={o} />
        ))}
      </div>
    </section>
  );
}

// One row: the whole Flyer small, title and place with the small print, the time and the type.
function Entry(props: { f: Filters; o: OnDay }) {
  const { f, o } = props;
  const { e } = o;
  const t = T[f.lang];
  const when = o.dayN ? `${t.day} ${o.dayN}/${o.dayOf}` : timeRange(e);
  return (
    <article class={e.cancelled ? "entry cancelled" : "entry"}>
      <a href={href(f, {}, `/events/${e.id}`)}>
        {e.flyer_key ? (
          <img class="thumb" src={`/${e.flyer_key}`} alt="" width="88" height="116" loading="lazy" decoding="async" />
        ) : (
          <span class="thumb none" aria-hidden="true" />
        )}
        <div class="what">
          <h3>{e.title}</h3>
          <p class="where">
            {e.venue}
            {km(e)}
          </p>
          <Notes f={f} e={e} lead={styleNames(e)} by={e.posted_by && e.posted_by !== e.title && e.posted_by !== e.venue ? e.posted_by : null} quiet />
        </div>
        <span class="time">{when}</span>
        <span class="tag">{e.cancelled ? <span class="kind off">{t.cancelled}</span> : <TypeLabel f={f} e={e} />}</span>
      </a>
    </article>
  );
}

// Tap a point, then "Von hier messen" opens the overview with that place, rounded to about a kilometre.
function MapPage(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  return (
    <Page f={f} title={t.map} head={MAP_HEAD}>
      <div class="page">
        <h1>{t.map}</h1>
        <p class="hint">{t.pick}</p>
        <div id="map" data-center={f.c || "51.43,9.70"} data-zoom={f.c ? "10" : "8"} data-style={MAP_STYLE} data-back={href(f, { c: "" })} />
        <div class="maprow">
          <a class="btn" href={href(f)}>
            <Arrow back /> {t.back}
          </a>
          <button id="use" class="btn solid" disabled>
            {t.use}
          </button>
        </div>
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
    marker = marker || new maplibregl.Marker({ color: "#7a1e3a" }).setLngLat(picked).addTo(map);
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
  const styles = styleNames(e);
  const date = e.starts_at.slice(0, 10);
  const when =
    e.type === "festival" && e.ends_at
      ? `${longDay(date, f.lang)} – ${longDay(e.ends_at.slice(0, 10), f.lang)}`
      : `${longDay(date, f.lang)}, ${timeRange(e)}`;
  const fact = (k: string, v: any) =>
    v ? (
      <>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </>
    ) : null;
  return (
    <Page f={f} title={e.title}>
      <article class={e.cancelled ? "page detail cancelled" : "page detail"}>
        <p class="back">
          <a href={href(f)}><Arrow back /> {t.back}</a>
        </p>
        <h1>{e.title}</h1>
        <p class="when">
          <b class="time">{when}</b>
          <TypeLabel f={f} e={e} />
        </p>
        <Badges f={f} e={e} />
        <div class="cols">
          {e.flyer_key && <img class="flyer" src={`/${e.flyer_key}`} alt={`Flyer: ${e.title}`} />}
          <div>
            <dl class="facts">
              {fact(t.venue, (
                <>
                  {[e.venue, e.address].filter(Boolean).join(", ")}
                  {km(e)}
                </>
              ))}
              {fact(t.intro, e.intro_class_at?.slice(11))}
              {fact(t.level, e.level)}
              {fact(t.by, e.posted_by)}
              {fact(t.price, e.price)}
              {fact(t.series, e.rule && ruleWords(JSON.parse(e.rule) as Rule, f.lang))}
              {fact(t.styles, styles.length > 0 && styles.join(", "))}
              {fact(
                t.link,
                e.link && (
                  <a href={e.link} rel="nofollow noopener" class="url">
                    {e.link}
                  </a>
                ),
              )}
            </dl>
            {e.description && <p class="desc">{e.description}</p>}
          </div>
        </div>
      </article>
    </Page>
  );
}

function TypeLabel(props: { f: Filters; e: Row }) {
  return <span class={`kind k-${kind(props.e)}`}>{T[props.f.lang][kind(props.e)]}</span>;
}

// The small print under a listing: Intro class, level, the Series rule, and the honest marks.
function Notes(props: { f: Filters; e: Row; by?: string | null; lead?: string[]; quiet?: boolean }) {
  const { f, e } = props;
  const t = T[f.lang];
  const notes = [
    ...(props.lead ?? []),
    props.by,
    e.intro_class_at && `${t.intro} ${e.intro_class_at.slice(11)}`,
    e.level,
    e.rule && ruleWords(JSON.parse(e.rule) as Rule, f.lang),
  ].filter(Boolean);
  return (
    <>
      {notes.length > 0 && <p class="notes">{notes.join(" · ")}</p>}
      <Badges f={f} e={e} quiet={props.quiet} />
    </>
  );
}

function Badges(props: { f: Filters; e: Row; quiet?: boolean }) {
  const { e } = props;
  const t = T[props.f.lang];
  const cancel = e.cancelled && !props.quiet; // a row shows the cancellation in place of its type
  if (!cancel && !e.is_tip && !isCourse(e)) return null;
  return (
    <p class="marks">
      {cancel ? <span class="mark cancel">{t.cancelled}</span> : null}
      {isCourse(e) ? <span class="mark reg">{t.reg}</span> : null}
      {e.is_tip ? <span class="mark tip">{t.tip}</span> : null}
    </p>
  );
}

// ---- Formatting ----

const kind = (e: Row) => (isCourse(e) ? "course" : e.type);
const styleNames = (e: Row) => (JSON.parse(e.styles) as string[]).map((s) => STYLES.find(([k]) => k === s)?.[1] ?? s);
const km = (e: Shown) => (e.km === null ? "" : ` · ${e.km < 10 ? e.km.toFixed(1).replace(".", ",") : Math.round(e.km)} km`);
const timeRange = (e: Row) => e.starts_at.slice(11) + (e.ends_at && e.type !== "festival" ? `–${e.ends_at.slice(11)}` : "");
const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "en-GB");
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const fmt = (iso: string, lang: Lang, o: Intl.DateTimeFormatOptions) => asDate(iso).toLocaleDateString(locale(lang), { ...o, timeZone: "UTC" });
const longDay = (iso: string, lang: Lang) => fmt(iso, lang, { weekday: "long", day: "numeric", month: "long" });
const short = (iso: string, lang: Lang) => fmt(iso, lang, { weekday: "short", day: "numeric", month: "short" });
const weekdayShort = (iso: string, lang: Lang) => fmt(iso, lang, { weekday: "short" });
const dayMonth = (iso: string, lang: Lang) => fmt(iso, lang, { day: "numeric", month: "long" });
const longWeekday = (iso: string, lang: Lang) => fmt(iso, lang, { weekday: "long" });
const monthName = (iso: string, lang: Lang) => fmt(iso, lang, { month: "long", year: "numeric" });
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

// The shared look (src/site.tsx) first: fonts, tokens, the bar, the buttons, the footer.
const CSS = `${SITE_CSS}
  /* the calendar: sidebar and pane; on a phone the sidebar is a sticky bar of menus */
  .app { margin:0; }
  aside.side { position:sticky; top:0; z-index:5; display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px var(--g); background:var(--paper); border-bottom:1px solid var(--line); }
  .side .views { order:1; display:flex; padding:3px; border-radius:99px; background:rgb(31 20 38 / .06); }
  .side .views a { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:99px; font-size:14px; color:var(--mute); }
  .side .views a.on { background:var(--card); color:var(--ink); font-weight:500; box-shadow:0 1px 3px rgb(31 20 38 / .15); }
  .side .pick.abo { order:2; margin-left:auto; }
  @media (max-width:479px) { .side .pick.abo summary { padding:7px 10px; } .abo-t { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; } }
  .side .br { order:3; flex-basis:100%; height:0; }
  .side .grp.place { order:4; }
  .side .pick.styles { order:5; }
  .side .grp > .lbl, .side .styles-open { display:none; }
  .pick summary { box-sizing:border-box; list-style:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-weight:500; font-size:15px; padding:7px 14px;
    border-radius:99px; border:1px solid var(--line); background:var(--card); white-space:nowrap; transition:border-color .15s, background .15s; }
  .pick summary:hover { border-color:rgb(31 20 38 / .3); }
  .pick summary::-webkit-details-marker { display:none; }
  .pick summary.set { color:var(--accent-ink); background:var(--tint); border-color:transparent; }
  .pick .chev { transition:transform .2s cubic-bezier(.2,.7,.2,1); }
  .pick[open] .chev { transform:rotate(180deg); }
  .pick .menu { position:absolute; left:var(--g); right:var(--g); top:100%; max-width:440px; margin-top:6px; padding:16px; background:var(--card);
    border-radius:var(--r); box-shadow:0 0 0 1px var(--line), 0 24px 50px -20px rgb(31 20 38 / .35); z-index:6; }
  .pick.abo .menu { left:auto; }
  .pick .menu .hint { margin:0 0 12px; font-size:14px; line-height:1.5; color:var(--mute); }
  .pick.abo .menu { display:grid; gap:8px; max-width:320px; }
  .pick.abo .btn { display:grid; place-items:center; height:auto; min-height:40px; padding:8px 14px; font-size:14px; line-height:1.25; text-align:center; }
  .opts { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .opts + .opts { margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
  .opts .lbl { margin-right:4px; }
  .opt { display:inline-block; padding:6px 12px; border-radius:99px; border:1px solid rgb(31 20 38 / .18); font-size:14px; line-height:1.3; white-space:nowrap; transition:background .15s; }
  .opt:hover { background:var(--wash); }
  .opt.on { background:var(--ink); border-color:var(--ink); color:#fff; }
  .box { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:8px; font-size:15px; transition:background .15s; }
  .box:hover { background:var(--wash); }
  .box i { flex:none; width:16px; height:16px; border-radius:4px; border:1.5px solid #c4b9bf; background:var(--card); display:grid; place-items:center; }
  .box.on i { background:var(--accent); border-color:var(--accent); }
  .box.on i::after { content:""; width:4px; height:8px; margin-top:-2px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
  .pane { padding:16px var(--g) 32px; min-width:0; }

  @media (min-width:860px) {
    .app { display:grid; grid-template-columns:232px minmax(0, 1fr); margin:24px var(--g) 0; background:var(--card); border-radius:var(--r); box-shadow:var(--shadow), 0 0 0 1px var(--line); }
    aside.side { top:0; display:block; align-self:start; padding:16px 12px 20px; background:none; border-bottom:0; }
    .side .views { display:grid; gap:2px; padding:0; background:none; border-radius:0; }
    .side .views a { gap:10px; padding:8px 10px; border-radius:8px; font-size:15px; color:var(--ink); }
    .side .views a svg { color:#978b93; }
    .side .views a:hover { background:var(--wash); }
    .side .views a.on { background:var(--tint); color:var(--accent-ink); box-shadow:none; }
    .side .views a.on svg { color:var(--accent); }
    .side .br, .side .pick.styles { display:none; }
    .side .grp > .lbl, .side .styles-open { display:block; }
    .side .grp > .lbl { margin:20px 10px 6px; }
    .side .grp.place .pick summary { width:100%; justify-content:space-between; }
    .side .pick .menu { position:static; margin-top:8px; padding:12px; box-shadow:0 0 0 1px var(--line); }
    .side .pick.abo { display:block; margin-top:24px; padding-top:16px; border-top:1px solid var(--line); }
    .side .pick.abo summary { width:100%; justify-content:flex-start; border:0; background:none; padding:8px 10px; border-radius:8px; color:var(--accent-ink); }
    .side .pick.abo summary:hover { background:var(--wash); }
    .pane { padding:20px 28px 28px; border-left:1px solid var(--line); }
  }

  /* the pane: the small calendar with Von and Bis, the shown span, the type tabs, the days */
  .spanpick { display:flex; flex-wrap:wrap; align-items:flex-start; gap:16px 28px; padding-bottom:16px; border-bottom:1px solid var(--line); }
  .mini { width:252px; max-width:100%; }
  .mhead { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; font-size:15px; font-weight:500; }
  .mhead a { display:inline-grid; place-items:center; width:30px; height:30px; border-radius:50%; transition:background .15s; }
  .mhead a:hover { background:var(--wash); }
  .mgrid { display:grid; grid-template-columns:repeat(7, 1fr); row-gap:2px; }
  .mgrid .dow { padding:2px 0 4px; text-align:center; font-size:11px; font-weight:500; color:var(--mute); }
  .mgrid .c { position:relative; display:grid; place-items:center; height:32px; font-size:13px; font-variant-numeric:tabular-nums; border-radius:8px; transition:background .12s; }
  .mgrid .c:hover { background:var(--wash); }
  .mgrid .c.out { color:#b0a6ac; }
  .mgrid .c.past { color:#978b93; }
  .mgrid .c.today { font-weight:600; color:var(--accent-ink); }
  .mgrid .c.busy::after { content:""; position:absolute; bottom:3px; left:50%; width:4px; height:4px; margin-left:-2px; border-radius:1px; background:var(--step); }
  .mgrid .c.past.busy::after, .mgrid .c.out.busy::after { background:#b0a6ac; }
  .mgrid .c.in { background:var(--tint); border-radius:0; }
  .mgrid .c.first { border-radius:8px 0 0 8px; } .mgrid .c.last { border-radius:0 8px 8px 0; } .mgrid .c.first.last { border-radius:8px; }
  .mgrid .c.first, .mgrid .c.last { background:var(--accent); color:#fff; font-weight:500; }
  .mgrid .c.first::after, .mgrid .c.last::after { background:#fff; }
  .mgrid .c.pend { background:var(--ink); color:#fff; border-radius:0; }
  .mgrid .c.pend::after { background:#fff; }
  .mini .hint { margin:8px 0 0; font-size:13px; color:var(--mute); }
  .dates { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px 12px; }
  .dates label { display:grid; gap:4px; font-size:13px; font-weight:500; color:var(--mute); }
  .dates input { height:38px; padding:0 10px; border:1px solid rgb(31 20 38 / .18); border-radius:10px; background:var(--card); color:var(--ink); font:400 15px var(--sans); }
  .dates .btn { height:38px; }
  .dates .reset { flex-basis:100%; font-size:14px; font-weight:500; color:var(--accent-ink); text-decoration:underline; text-underline-offset:3px; }
  .dates.auto .btn { display:none; }
  @media (min-width:600px) { .dates { flex-direction:column; align-items:stretch; padding-top:36px; } .dates .reset { flex-basis:auto; } }
  @media (max-width:599px) {
    .spanpick { gap:10px; padding-bottom:12px; }
    .mini { width:100%; max-width:340px; }
    .mhead { margin-bottom:2px; }
    .mgrid .dow { padding:0 0 2px; font-size:10px; }
    .mgrid .c { height:26px; font-size:12px; }
    .mgrid .c.busy::after { bottom:1px; width:3px; height:3px; margin-left:-1.5px; }
    .mini .hint { margin-top:4px; font-size:12px; }
    .dates { width:100%; }
    .dates label { flex:1; font-size:12px; }
    .dates input { width:100%; height:34px; font-size:14px; }
  }
  .range { margin:18px 0 0; font:500 20px/1.3 var(--sans); letter-spacing:-.01em; }
  .types { display:flex; gap:4px; margin:14px 0 0; overflow-x:auto; scrollbar-width:none; }
  .types::-webkit-scrollbar { display:none; }
  .types a { flex:none; padding:6px 13px; border-radius:99px; font-size:15px; color:var(--mute); transition:background .15s, color .15s; }
  .types a:hover { color:var(--ink); background:var(--wash); }
  .types a.on { color:var(--ink); font-weight:500; background:rgb(31 20 38 / .08); }

  .day { margin-top:24px; }
  .dayhead { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  .dayhead h2 { margin:0; font:500 19px/1.3 var(--sans); letter-spacing:-.01em; }
  .dayhead .date { margin-left:4px; font-size:15px; font-weight:400; color:var(--mute); }
  .dayhead .now { display:inline-block; margin-left:8px; padding:1px 9px; border-radius:99px; background:var(--accent); color:#fff; font-size:12px; vertical-align:2px; }
  .dayhead .count { font-size:14px; color:var(--mute); white-space:nowrap; }
  .entry > a { display:grid; grid-template-columns:88px minmax(0, 1fr) auto 112px; column-gap:20px; align-items:center; padding:14px 8px; border-bottom:1px solid var(--line); border-radius:10px; transition:background .15s; }
  .entry:last-child > a { border-bottom-color:transparent; }
  .entry > a:hover { background:var(--wash); }
  .thumb { display:block; width:88px; height:116px; object-fit:contain; border-radius:8px; background:var(--wash); }
  .thumb.none { box-shadow:inset 0 0 0 1px var(--hair); background:none; }
  .what { min-width:0; }
  .what h3 { margin:0; font:500 18px/1.3 var(--sans); }
  .where { margin:2px 0 0; font-size:15px; color:var(--mute); }
  .what .notes { margin:4px 0 0; font-size:14px; color:#6a5f68; }
  .what .marks { margin:6px 0 0; }
  .time { font-size:16px; text-align:right; white-space:nowrap; }
  .tag { justify-self:end; }
  .kind { display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 10px; border-radius:99px; background:var(--tint); color:var(--accent-ink); font-size:13px; font-weight:500; white-space:nowrap; }
  .kind::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
  .kind.k-workshop { background:var(--warm-tint); color:var(--warm); }
  .kind.k-course { background:#eee6ea; color:var(--ink); }
  .kind.off { background:var(--off-tint); color:var(--off); }
  .marks { margin:10px 0 0; display:flex; flex-wrap:wrap; gap:6px; }
  .mark { display:inline-flex; align-items:center; height:22px; padding:0 9px; border-radius:99px; font-size:12px; font-weight:500; }
  .mark.cancel { background:var(--off-tint); color:var(--off); }
  .mark.reg { box-shadow:inset 0 0 0 1px rgb(31 20 38 / .25); }
  .mark.tip { padding:0; height:auto; font-weight:400; font-style:italic; color:var(--mute); }
  .cancelled h3, .detail.cancelled h1 { text-decoration:line-through; text-decoration-thickness:1.5px; color:var(--mute); }
  .cancelled .thumb { filter:grayscale(1); opacity:.5; }
  .empty { margin:0; padding:48px 0; color:var(--mute); }
  @media (max-width:599px) {
    .entry > a { grid-template-columns:96px auto minmax(0, 1fr); grid-template-areas:"thumb time tag" "thumb what what"; column-gap:14px; row-gap:4px; align-items:start; padding:14px 4px; }
    .thumb { grid-area:thumb; width:96px; height:128px; }
    .time { grid-area:time; text-align:left; font-weight:500; line-height:24px; }
    .tag { grid-area:tag; justify-self:start; }
    .what { grid-area:what; }
  }
  @media (prefers-reduced-motion: reduce) { .pick .chev, .entry > a { transition:none; } }

  /* the map */
  .evmap { height:min(64vh, 620px); min-height:360px; margin-top:16px; border-radius:var(--r-sm); overflow:hidden; box-shadow:0 0 0 1px var(--line); background:var(--wash); }
  .pin { min-width:30px; height:30px; padding:0 9px; border-radius:99px; border:2px solid #fff; background:var(--accent); color:#fff; font:600 14px/1 var(--sans);
    box-shadow:0 2px 10px rgb(31 20 38 / .3); cursor:pointer; transition:transform .15s; }
  .pin:hover { transform:scale(1.08); }
  .pin.off { background:#978b93; }
  .pin.group { min-width:38px; height:38px; font-size:15px; background:var(--ink); box-shadow:0 0 0 5px rgb(122 30 58 / .25), 0 2px 10px rgb(31 20 38 / .3); }
  .pop .venue + .venue { margin-top:10px; padding-top:8px; border-top:2px solid var(--line); }
  .here { width:12px; height:12px; border-radius:50%; background:var(--ink); border:3px solid #fff; box-shadow:0 0 0 6px rgb(31 20 38 / .15); }
  .maplibregl-popup-content { font-family:var(--sans); border-radius:12px; padding:12px 14px; box-shadow:0 18px 40px -16px rgb(31 20 38 / .45); }
  .pop .venue b { display:block; margin:0 18px 4px 0; font-size:15px; font-weight:500; }
  .pop .venue a { display:grid; padding:7px 0; border-top:1px solid var(--line); color:var(--ink); }
  .pop a:hover strong { color:var(--accent-ink); }
  .pop span { font-size:12px; color:var(--mute); }
  .pop strong { font-size:14px; font-weight:500; line-height:1.3; }
  .pop small { font-size:12px; color:var(--accent-ink); }
  .pop a.off strong { text-decoration:line-through; color:var(--mute); }
  .pop a.off small { color:var(--off); }
  .unplaced { margin-top:28px; }
  .unplaced > h2 { margin:0; font:500 19px/1.3 var(--sans); }
  .unplaced > .hint { margin:2px 0 0; font-size:14px; color:var(--mute); }
  .unplaced .day { margin-top:16px; }

  /* details, map */
  @media (min-width:960px) { :root { --g:max(32px, calc((100vw - 1180px) / 2)); } .mast { padding-top:16px; padding-bottom:16px; } }
  .page { margin:0 var(--g); padding:20px 0 32px; }
  .page .back { margin:0 0 16px; font-weight:500; }
  .page .back a { display:inline-flex; align-items:center; gap:4px; padding:6px 12px 6px 8px; border-radius:99px; background:var(--card); box-shadow:0 0 0 1px var(--line); }
  .page .back a:hover { background:var(--wash); }
  .arrow { display:block; }
  .back .arrow { display:inline-block; vertical-align:-2px; }
  .page h1 { margin:0; font:500 clamp(30px, 7vw, 52px)/1.05 var(--sans); letter-spacing:-.035em; text-wrap:balance; max-width:22ch; }
  .when { margin:12px 0 0; display:flex; flex-wrap:wrap; align-items:center; column-gap:10px; row-gap:6px; }
  .when b { font-weight:500; font-size:16px; }
  .detail .cols { margin-top:20px; }
  .flyer { display:block; max-width:100%; width:100%; height:auto; border-radius:var(--r); background:var(--wash); }
  .cancelled .flyer { filter:grayscale(1); opacity:.45; }
  .facts { display:grid; grid-template-columns:minmax(90px, auto) 1fr; margin:16px 0 0; padding:8px 20px; background:var(--card); border-radius:var(--r); box-shadow:0 0 0 1px var(--line); }
  .facts dt, .facts dd { padding:12px 0; border-bottom:1px solid var(--line); }
  .facts dt { padding-right:12px; }
  .facts dd { margin:0; font-size:16px; }
  .facts > :nth-last-child(-n+2) { border-bottom:0; }
  .facts .url { overflow-wrap:anywhere; color:var(--accent-ink); text-decoration:underline; text-underline-offset:3px; }
  .desc { margin:20px 0 0; white-space:pre-line; font-size:16px; line-height:1.65; max-width:65ch; }
  @media (min-width:860px) {
    .detail .cols { display:grid; grid-template-columns:minmax(0, 5fr) minmax(0, 4fr); gap:40px; align-items:start; }
    .facts { margin-top:0; }
  }
  .page .hint { margin:8px 0 14px; color:var(--mute); }
  #map { height:62vh; border-radius:var(--r); overflow:hidden; box-shadow:0 0 0 1px var(--line); }
  .maprow { display:flex; justify-content:space-between; gap:8px; margin-top:12px; }
  .btn { font:500 15px var(--sans); height:44px; padding:0 20px; border-radius:99px; border:1px solid rgb(31 20 38 / .2); background:var(--card); color:var(--ink); cursor:pointer; transition:background .15s, transform .15s; }
  .btn:hover { background:var(--wash); }
  .btn:active { transform:scale(.97); }
  .btn.solid { background:var(--accent); border-color:var(--accent); color:#fff; }
  .btn.solid:hover { background:var(--accent-ink); }
  .btn:disabled { opacity:.35; cursor:default; }
  .btn[hidden] { display:none !important; }

  /* the footer */
  body > footer { margin:32px var(--g) 0; padding:20px 0 32px; border-top:1px solid var(--line); font-size:14px; line-height:1.9; color:var(--mute); }
  body > footer a { color:var(--ink); text-decoration:underline; text-decoration-color:var(--hair); text-underline-offset:3px; }
  body > footer a:hover { text-decoration-color:currentColor; }
`;
