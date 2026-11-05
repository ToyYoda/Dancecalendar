import { Hono } from "hono";
import { Layout } from "./layout";
import { addDays, ruleWords, type Rule } from "./series";
import { berlinDate } from "./whatsapp/bot";

// The Dancer overview at "/": a listing of Events with their Flyers, paged by week (the default) and a month calendar with a day
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
type Filters = { c: string; r: string; styles: string[]; type: string; view: string; w: string; d: string; lang: Lang };

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
    series: "Serie", link: "Link", styles: "Tanzstil", day: "Tag", feed: "Liste", calendar: "Monat", back: "Zurück",
    today: "Heute", sub: "Partnertanz in Kassel, Göttingen und drumherum",
    listings: "Termine", filters: "Filter", week: "KW", prev: "Früher", next: "Später", days: "Tage", noFlyer: "Kein Flyer",
  },
  en: {
    all: "All", party: "Party", workshop: "Workshop", course: "Course", festival: "Festival",
    parties: "Parties", workshops: "Workshops", courses: "Courses", festivals: "Festivals",
    anywhere: "anywhere", me: "My location", noGeo: "Location not available", map: "Pick on map", here: "From here",
    noPlace: "All places", hint: "For distances: allow your location or pick a place on the map.",
    pick: "Tap the map to pick the place.", use: "Measure from here",
    radius: "Radius", none: "No events for these filters.", cancelled: "Cancelled", tip: "added by the community",
    reg: "Registration required", intro: "Intro class", level: "Level", price: "Price", venue: "Venue", by: "Organized by",
    series: "Series", link: "Link", styles: "Style", day: "Day", feed: "List", calendar: "Month", back: "Back",
    today: "Today", sub: "Partner dance in and around Kassel and Göttingen",
    listings: "Listings", filters: "Filters", week: "Week", prev: "Earlier", next: "Later", days: "Days", noFlyer: "No Flyer",
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
// "Termine": the Dancer pages are set like a city magazine's listings. A masthead, the filters as a strip
// under its rule, and each day as a giant numeral that stays beside its Events while they scroll past. The
// Flyers stand whole in the column, never cropped or covered. One magenta marks today, each Event's type
// and what a filter has picked. The fonts come from this site, so no font host learns who looks.

function Page(props: { f: Filters; title?: string; head?: any; week?: string; children: any }) {
  const t = T[props.f.lang];
  const head = (
    <>
      <link rel="preload" href="/fonts/archivo-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin="" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {props.head}
    </>
  );
  return (
    <Layout title={props.title ? `${props.title} – DanceCalendar` : "DanceCalendar"} lang={props.f.lang} head={head}>
      <header class="mast">
        <a class="home" href={href(props.f, { w: "", d: "" })}>
          <span class="name">{t.listings}</span>
          <span class="sub">{t.sub}</span>
        </a>
        <span class="side">
          <span class="brand">DanceCalendar{props.week ? ` · ${props.week}` : ""}</span>
          <a class="lang" href={href(props.f, { lang: props.f.lang === "de" ? "en" : "de" })} lang={props.f.lang === "de" ? "en" : "de"}>
            {props.f.lang === "de" ? "English" : "Deutsch"}
          </a>
        </span>
      </header>
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

// The types as tabs, then the place, the styles and the Liste/Monat switch. The place's options and, on a
// phone, the styles open as menus below the strip; from 720px the styles show inline. A tap elsewhere
// closes a menu.
function FilterBar(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  const r = f.r || DEFAULT_RADIUS;
  const toggleStyle = (s: string) => (f.styles.includes(s) ? f.styles.filter((x) => x !== s) : [...f.styles, s]);
  const chips = STYLES.map(([k, name]) => (
    <a class={f.styles.includes(k) ? "opt on" : "opt"} href={href(f, { styles: toggleStyle(k) })} aria-pressed={f.styles.includes(k) ? "true" : "false"}>
      {name}
    </a>
  ));
  const picked = STYLES.filter(([k]) => f.styles.includes(k)).map(([, name]) => name);
  return (
    <nav class="filters" aria-label={t.filters}>
      <div class="types">
        <a class={f.type ? "" : "on"} href={href(f, { type: "" })} aria-current={f.type ? undefined : "true"}>
          {t.all}
        </a>
        {TYPES.map((k) => (
          <a class={f.type === k ? "on" : ""} href={href(f, { type: k })} aria-current={f.type === k ? "true" : undefined}>
            {t[PLURAL[k]]}
          </a>
        ))}
      </div>
      <div class="row2">
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
        <details class="pick styles">
          <summary class={picked.length ? "set" : ""}>
            {!picked.length ? t.styles : picked.length === 1 ? picked[0] : `${picked[0]} +${picked.length - 1}`}
            <Chevron />
          </summary>
          <div class="menu">
            <div class="opts">{chips}</div>
          </div>
        </details>
        <div class="inline">{chips}</div>
        <div class="views">
          <a class={f.view ? "" : "on"} href={href(f, { view: "", d: "" })} aria-current={f.view ? undefined : "true"}>
            {t.feed}
          </a>
          <a class={f.view ? "on" : ""} href={href(f, { view: "cal", w: "" })} aria-current={f.view ? "true" : undefined}>
            {t.calendar}
          </a>
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("click",(e)=>document.querySelectorAll(".filters .pick[open]").forEach((d)=>{if(!d.contains(e.target))d.open=false;}));
(()=>{const n=document.querySelector(".filters");if(!n)return;const s=()=>document.documentElement.style.setProperty("--stick",n.offsetHeight+"px");s();addEventListener("resize",s);})();`,
        }}
      />
    </nav>
  );
}

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
    <Page f={f} week={`${t.week} ${isoWeek(days[0])}`}>
      <FilterBar f={f} />
      <div class="weekbar">
        <span class="range">
          {short(days[0], f.lang)} – {short(days.at(-1)!, f.lang)}
        </span>
        <span class="nav">
          {prev !== null ? (
            <a href={href(f, { w: prev })} aria-label={t.prev}><Arrow back /></a>
          ) : (
            <span class="off" aria-hidden="true"><Arrow back /></span>
          )}
          <a href={href(f, { w: next })} aria-label={t.next}><Arrow /></a>
        </span>
      </div>
      <ol class="index" aria-label={t.days}>
        {days.map((d) => {
          const n = byDay.get(d)!.length;
          return (
            <li>
              <a class={[n ? "" : "none", d === today ? "today" : ""].join(" ").trim() || undefined} href={n ? `#day-${d}` : undefined}>
                <span class="wd">{d === today ? t.today : weekdayShort(d, f.lang)}</span>
                <b>{Number(d.slice(8))}</b>
                <span class="n">{n || "–"}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <main class="days">
        {[...byDay].map(([d, list]) =>
          list.length ? (
            <section class={d === today ? "day today" : "day"} id={`day-${d}`} aria-labelledby={`h-${d}`}>
              <h2 class="num" id={`h-${d}`}>
                <span class="big">{Number(d.slice(8))}</span>
                <span class="wd">{longWeekday(d, f.lang)}</span>
                <span class="mo">{d === today ? t.today : monthShort(d, f.lang)}</span>
              </h2>
              <div class="list">
                {list.map((o) => (
                  <Entry f={f} o={o} />
                ))}
              </div>
            </section>
          ) : null,
        )}
        {!any && <p class="empty">{t.none}</p>}
      </main>
    </Page>
  );
}

// One listing: title, then when, what and where, the notes, and the whole Flyer.
function Entry(props: { f: Filters; o: OnDay; compact?: boolean }) {
  const { f, o } = props;
  const { e } = o;
  const t = T[f.lang];
  const when = o.dayN ? `${t.day} ${o.dayN}/${o.dayOf}` : timeRange(e);
  return (
    <article class={e.cancelled ? "entry cancelled" : "entry"}>
      <a href={href(f, {}, `/events/${e.id}`)}>
        <h3>{e.title}</h3>
        <p class="when">
          <b class="time">{when}</b>
          <TypeLabel f={f} e={e} />
          <StyleNames e={e} />
          <span class="where">
            {e.venue}
            {km(e)}
          </span>
        </p>
        <Notes f={f} e={e} by={e.posted_by && e.posted_by !== e.title ? e.posted_by : null} />
        {!props.compact &&
          (e.flyer_key ? (
            <img class="flyer" src={`/${e.flyer_key}`} alt={`Flyer: ${e.title}`} loading="lazy" decoding="async" />
          ) : (
            <span class="flyer none">{t.noFlyer}</span>
          ))}
      </a>
    </article>
  );
}

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
    <Page f={f} week={monthName(first, f.lang)}>
      <FilterBar f={f} />
      <div class="weekbar">
        <span class="range">{monthName(first, f.lang)}</span>
        <span class="nav">
          <a href={href(f, { d: shift(-1) })} aria-label={t.prev}><Arrow back /></a>
          <a href={href(f, { d: shift(1) })} aria-label={t.next}><Arrow /></a>
        </span>
      </div>
      <div class="month" role="grid">
        {dows.map((d) => (
          <div class="dow" role="columnheader">{d}</div>
        ))}
        {[...byDay].map(([d, l]) => {
          const cls = ["cell", d.slice(0, 7) !== month ? "out" : "", d === sel ? "sel" : "", d === today ? "today" : "", d < today ? "past" : ""]
            .filter(Boolean)
            .join(" ");
          const own = l.filter((o) => o.e.type !== "festival");
          return (
            <a class={cls} href={href(f, { d })} aria-label={`${longDay(d, f.lang)}: ${l.length}`} aria-current={d === sel ? "date" : undefined}>
              <span class="n">{Number(d.slice(8))}</span>
              <span class="ticks">
                {own.slice(0, 4).map((o) => (
                  <i class={o.e.cancelled ? "x" : ""} />
                ))}
              </span>
              {l.some((o) => o.e.type === "festival") && <span class="fest" />}
            </a>
          );
        })}
      </div>
      <section class={sel === today ? "day today" : "day"} aria-labelledby="h-sel">
        <h2 class="num" id="h-sel">
          <span class="big">{Number(sel.slice(8))}</span>
          <span class="wd">{longWeekday(sel, f.lang)}</span>
          <span class="mo">{sel === today ? t.today : monthShort(sel, f.lang)}</span>
        </h2>
        <div class="list">
          {list.length ? list.map((o) => <Entry f={f} o={o} compact />) : <p class="empty">{t.none}</p>}
        </div>
      </section>
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
    marker = marker || new maplibregl.Marker({ color: "#d6006d" }).setLngLat(picked).addTo(map);
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
  return <span class="kind">{T[props.f.lang][kind(props.e)]}</span>;
}

function StyleNames(props: { e: Row }) {
  const s = styleNames(props.e);
  return s.length ? <span class="sty">{s.join(" · ")}</span> : null;
}

// The small print under a listing: Intro class, level, the Series rule, and the honest marks.
function Notes(props: { f: Filters; e: Row; by?: string | null }) {
  const { f, e } = props;
  const t = T[f.lang];
  const notes = [
    props.by,
    e.intro_class_at && `${t.intro} ${e.intro_class_at.slice(11)}`,
    e.level,
    e.rule && ruleWords(JSON.parse(e.rule) as Rule, f.lang),
  ].filter(Boolean);
  return (
    <>
      {notes.length > 0 && <p class="notes">{notes.join(" · ")}</p>}
      <Badges f={f} e={e} />
    </>
  );
}

function Badges(props: { f: Filters; e: Row }) {
  const { e } = props;
  const t = T[props.f.lang];
  if (!e.cancelled && !e.is_tip && !isCourse(e)) return null;
  return (
    <p class="marks">
      {e.cancelled ? <span class="mark cancel">{t.cancelled}</span> : null}
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
const longWeekday = (iso: string, lang: Lang) => fmt(iso, lang, { weekday: "long" });
const monthShort = (iso: string, lang: Lang) => fmt(iso, lang, { month: "long" });
const monthName = (iso: string, lang: Lang) => fmt(iso, lang, { month: "long", year: "numeric" });
const weekday = (iso: string) => asDate(iso).getUTCDay();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(asDate(s).getTime());
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
// ISO 8601 week number: the week with the year's first Thursday is week 1.
const isoWeek = (iso: string) => {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round((d.getTime() - jan4.getTime()) / 86_400_000 / 7 - 3 / 7 + ((jan4.getUTCDay() + 6) % 7) / 7);
};

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

const FONTS = [
  ["Archivo", 400, "archivo-latin-400-normal"],
  ["Archivo", 600, "archivo-latin-600-normal"],
  ["Archivo", 800, "archivo-latin-800-normal"],
  ["Archivo Narrow", 700, "archivo-narrow-latin-700-normal"],
]
  .map(([family, weight, file]) => `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(/fonts/${file}.woff2) format("woff2");}`)
  .join("\n");

const CSS = `${FONTS}
  :root { color-scheme:light; --paper:#fff; --ink:#111; --mute:#595959; --hair:#d4d4d4; --wash:#f3f3f1; --accent:#d6006d; --accent-ink:#b0005a;
          --sans:"Archivo", system-ui, sans-serif; --narrow:"Archivo Narrow", "Archivo", system-ui, sans-serif; --stick:96px; --g:16px; }
  html { background:var(--paper); scroll-padding-top:calc(var(--stick) + 8px); }
  body { max-width:none; margin:0; padding:0; background:var(--paper); color:var(--ink); font:400 15px/1.45 var(--sans);
         font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
  a { color:inherit; text-decoration:none; }
  ::selection { background:var(--accent); color:#fff; }
  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .lbl, .kind, .mark, .index .wd, .num .wd, .num .mo, .dow, .facts dt, .brand, .lang, .weekbar .range {
    font-family:var(--narrow); font-weight:700; text-transform:uppercase; letter-spacing:.08em; }

  /* the masthead */
  .mast { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; padding:18px var(--g) 10px; border-bottom:4px solid var(--ink); }
  .mast .home { display:block; min-width:0; }
  .mast .name { display:block; font:800 clamp(34px, 10vw, 64px)/.86 var(--sans); letter-spacing:-.035em; }
  .mast .sub { display:block; margin-top:8px; font-size:12.5px; color:var(--mute); }
  .mast .side { display:flex; flex-direction:column; align-items:flex-end; gap:8px; text-align:right; padding-bottom:2px; }
  .mast .brand { font-size:12px; }
  .mast .lang { font-size:11px; color:var(--mute); border-bottom:1px solid currentColor; }
  .mast .lang:hover { color:var(--ink); }

  /* the filter strip */
  .filters { position:sticky; top:0; z-index:5; background:var(--paper); border-bottom:1px solid var(--ink); padding:0 var(--g); }
  .filters .types { display:flex; gap:18px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--hair); }
  .filters .types::-webkit-scrollbar { display:none; }
  .filters .types a { flex:none; padding:11px 0 9px; font-weight:600; font-size:14.5px; color:var(--mute); border-bottom:3px solid transparent; margin-bottom:-1px; }
  .filters .types a:hover { color:var(--ink); }
  .filters .types a.on { color:var(--ink); font-weight:800; border-bottom-color:var(--ink); }
  .filters .row2 { position:relative; display:flex; align-items:center; gap:18px; padding:8px 0; }
  .pick summary { list-style:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:14.5px; padding:4px 0; white-space:nowrap; }
  .pick summary::-webkit-details-marker { display:none; }
  .pick summary.set { color:var(--accent-ink); }
  .pick .chev { transition:transform .2s cubic-bezier(.2,.7,.2,1); }
  .pick[open] .chev { transform:rotate(180deg); }
  .pick .menu { position:absolute; left:0; right:0; top:100%; max-width:440px; margin-top:1px; padding:14px; background:var(--paper);
    border:1.5px solid var(--ink); box-shadow:0 14px 30px rgba(17,17,17,.14); z-index:6; }
  .pick .menu .hint { margin:0 0 12px; font-size:13px; line-height:1.45; color:var(--mute); }
  .opts { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .opts + .opts { margin-top:12px; padding-top:12px; border-top:1px dotted var(--hair); }
  .opts .lbl { font-size:11px; color:var(--mute); margin-right:4px; }
  .opt { display:inline-block; padding:6px 10px; border:1px solid var(--ink); font-weight:600; font-size:13.5px; line-height:1.2; white-space:nowrap; }
  .opt:hover { background:var(--wash); }
  .opt.on { background:var(--ink); color:#fff; }
  .filters .inline { display:none; }
  .views { margin-left:auto; display:flex; border:1px solid var(--ink); }
  .views a { padding:5px 10px; font-weight:600; font-size:13px; }
  .views a.on { background:var(--ink); color:#fff; }
  @media (min-width:720px) {
    .filters .styles { display:none; }
    .filters .inline { display:flex; gap:6px; padding-left:18px; border-left:1px solid var(--hair); }
    .filters .inline .opt { padding:4px 9px; font-size:13px; border-color:var(--hair); }
    .filters .inline .opt.on { border-color:var(--ink); }
  }

  /* the week and its day index */
  .weekbar { display:flex; align-items:center; justify-content:space-between; padding:14px var(--g) 0; }
  .weekbar .range { font-size:13px; }
  .weekbar .nav { display:flex; gap:6px; }
  .weekbar .nav a, .weekbar .nav .off { display:inline-grid; place-items:center; width:34px; height:34px; border:1px solid var(--ink); font-size:18px; line-height:1; }
  .weekbar .nav a:hover { background:var(--ink); color:#fff; }
  .weekbar .nav .off { border-color:var(--hair); color:var(--hair); }
  .index { list-style:none; display:grid; grid-template-columns:repeat(8, 1fr); margin:10px var(--g) 0; padding:0; border-top:1px solid var(--ink); border-bottom:1px solid var(--ink); }
  .index li { padding:0; border:0; min-width:0; }
  .index li + li { border-left:1px dotted var(--hair); }
  .index a { display:flex; flex-direction:column; align-items:center; padding:6px 0 7px; }
  .index a[href]:hover { background:var(--wash); }
  .index .wd { font-size:10px; color:var(--mute); white-space:nowrap; }
  .index b { font:800 21px/1.05 var(--sans); letter-spacing:-.02em; }
  .index .n { font-size:11px; font-weight:600; color:var(--mute); }
  .index .today .wd, .index .today b { color:var(--accent); }
  .index .none, .index .none .wd, .index .none .n { color:#767676; }
  .index:has(li:nth-child(7):last-child) { grid-template-columns:repeat(7, 1fr); }

  /* a day: the numeral column beside its listings */
  .days { padding-bottom:24px; }
  .day { display:grid; grid-template-columns:78px minmax(0, 1fr); column-gap:14px; margin:0 var(--g); padding:16px 0 4px; border-bottom:1px solid var(--ink); }
  .num { position:sticky; top:calc(var(--stick) + 10px); align-self:start; margin:0; display:flex; flex-direction:column; }
  .num .big { font:800 72px/.8 var(--sans); letter-spacing:-.04em; margin-left:-3px; }
  .num .wd { margin-top:10px; font-size:13px; }
  .num .mo { font-size:11px; color:var(--mute); }
  .day.today .big, .day.today .mo { color:var(--accent); }
  /* on a phone the numeral becomes a pinned band, so the Flyers get the whole width */
  @media (max-width:599px) {
    .day { display:block; padding-top:0; }
    .num { top:var(--stick); z-index:2; flex-direction:row; align-items:flex-end; gap:10px; padding:12px 0 10px; margin-bottom:12px;
      background:var(--paper); border-bottom:1px dotted #9a9a9a; }
    .num .big { font-size:52px; }
    .num .wd { margin:0 0 2px; font-size:14px; }
    .num .mo { margin-bottom:3px; font-size:12px; }
  }
  .entry { padding:0 0 16px; }
  .entry + .entry { padding-top:14px; border-top:1px dotted #9a9a9a; }
  .entry > a { display:block; }
  .entry h3 { margin:0; font:800 20px/1.15 var(--sans); letter-spacing:-.015em; text-wrap:balance; }
  .entry > a:hover h3 { text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:3px; }
  .when { margin:5px 0 0; display:flex; flex-wrap:wrap; align-items:baseline; column-gap:10px; row-gap:2px; }
  .when b { font-weight:800; font-size:15px; }
  .kind { font-size:12px; color:var(--accent-ink); }
  .sty { font-size:13.5px; color:var(--mute); }
  .when .where { font-size:14px; }
  .when .where::before { content:"· "; color:var(--mute); }
  .arrow { display:block; }
  .back .arrow { display:inline-block; vertical-align:-2px; }
  .notes { margin:4px 0 0; font-size:13px; color:var(--mute); }
  .marks { margin:7px 0 0; display:flex; flex-wrap:wrap; gap:6px; }
  .mark { display:inline-block; font-size:11px; padding:3px 6px 2px; line-height:1.2; }
  .mark.cancel { background:var(--ink); color:#fff; }
  .mark.reg { border:1px solid var(--ink); }
  .mark.tip { font-family:var(--sans); text-transform:none; letter-spacing:0; font-weight:400; font-style:italic; font-size:12.5px; color:var(--mute); padding-left:0; padding-right:0; }
  .flyer { display:block; margin-top:12px; max-width:100%; width:auto; height:auto; max-height:82vh; background:var(--wash); }
  .flyer.none { display:grid; place-items:center; width:100%; height:120px; border:1px dashed var(--hair); color:var(--mute); font-size:13px; background:none; }
  .cancelled h3, .detail.cancelled h1 { text-decoration:line-through; text-decoration-thickness:2px; }
  .cancelled .flyer { filter:grayscale(1); opacity:.45; }
  .empty { margin:0; padding:48px 0; color:var(--mute); }
  .days > .empty { padding:56px var(--g); }
  @media (min-width:960px) {
    :root { --g:max(32px, calc((100vw - 1180px) / 2)); }
    .day { grid-template-columns:150px minmax(0, 1fr); column-gap:28px; padding-top:22px; }
    .num .big { font-size:120px; }
    .num .wd { font-size:15px; margin-top:14px; }
    .entry { padding:4px 0 24px; }
    .entry + .entry { padding-top:24px; }
    .entry > a { display:grid; grid-template-columns:minmax(0, 1fr) 360px; column-gap:32px; align-content:start; }
    .entry > a > * { grid-column:1; }
    .entry > a > .flyer { grid-column:2; grid-row:1 / span 8; margin-top:0; width:100%; max-height:none; }
    .entry h3 { font-size:26px; }
    .mast .name { font-size:84px; }
  }

  /* the month */
  .month { display:grid; grid-template-columns:repeat(7, 1fr); margin:10px var(--g) 0; border-top:1px solid var(--ink); border-left:1px solid var(--hair); }
  .month .dow { padding:6px 0; text-align:center; font-size:11px; color:var(--mute); border-right:1px solid var(--hair); border-bottom:1px solid var(--ink); }
  .cell { position:relative; min-height:54px; padding:5px 6px; border-right:1px solid var(--hair); border-bottom:1px solid var(--hair); }
  .cell:hover { background:var(--wash); }
  .cell .n { font:800 17px/1 var(--sans); }
  .cell.out .n, .cell.past .n { color:#767676; }
  .cell.today .n { color:var(--accent); }
  .cell.sel { background:var(--ink); color:#fff; } .cell.sel .n { color:#fff; }
  .cell .ticks { display:flex; flex-wrap:wrap; gap:3px; margin-top:6px; }
  .cell .ticks i { width:7px; height:7px; background:var(--accent); }
  .cell .ticks i.x { background:#a3a3a3; }
  .cell.sel .ticks i { background:#fff; }
  .cell.today.sel { box-shadow:inset 0 4px 0 var(--accent); } .cell.today.sel .ticks i { background:var(--accent); }
  .cell .fest { position:absolute; left:0; right:-1px; bottom:4px; height:4px; background:var(--accent); opacity:.45; }
  .month + .day { margin-top:18px; border-top:1px solid var(--ink); }
  @media (min-width:960px) { .cell { min-height:84px; } }

  /* details, map */
  .page { margin:0 var(--g); padding:14px 0 28px; }
  .page .back { margin:0 0 14px; font-weight:600; }
  .page .back a { border-bottom:1px solid currentColor; }
  .page h1 { margin:0; font:800 clamp(30px, 8vw, 56px)/1 var(--sans); letter-spacing:-.03em; text-wrap:balance; max-width:22ch; }
  .detail .when { margin-top:10px; }
  .detail .when b { font-size:16px; }
  .detail .cols { margin-top:16px; border-top:1px solid var(--ink); padding-top:16px; }
  .detail .flyer { margin-top:0; max-height:none; width:100%; }
  .facts { display:grid; grid-template-columns:minmax(90px, auto) 1fr; margin:16px 0 0; }
  .facts dt, .facts dd { padding:9px 0; border-bottom:1px dotted #9a9a9a; }
  .facts dt { font-size:11px; color:var(--mute); padding-top:12px; padding-right:12px; }
  .facts dd { margin:0; font-size:15px; }
  .facts .url { overflow-wrap:anywhere; border-bottom:1px solid currentColor; }
  .desc { margin:18px 0 0; white-space:pre-line; font-size:15.5px; line-height:1.6; max-width:65ch; }
  @media (min-width:860px) {
    .detail .cols { display:grid; grid-template-columns:minmax(0, 5fr) minmax(0, 4fr); gap:36px; align-items:start; }
    .facts { margin-top:0; } .facts dt, .facts dd { padding-top:0; }
    .facts > :nth-child(-n+2) { border-top:0; }
  }
  .page .hint { margin:8px 0 14px; color:var(--mute); }
  #map { height:62vh; border:1px solid var(--ink); }
  .maprow { display:flex; justify-content:space-between; gap:8px; margin-top:12px; }
  .btn { font:600 14.5px var(--sans); padding:9px 14px; border:1px solid var(--ink); background:var(--paper); color:var(--ink); cursor:pointer; }
  .btn.solid { background:var(--ink); color:#fff; }
  .btn:disabled { opacity:.35; cursor:default; }

  /* the footer */
  body > footer { margin:24px var(--g) 0; padding:14px 0 28px; border-top:4px solid var(--ink); font-size:12.5px; line-height:1.8; color:var(--mute); }
  body > footer a { color:var(--ink); border-bottom:1px solid var(--hair); }
  @media (prefers-reduced-motion: reduce) { .pick .chev { transition:none; } }
`;
