import { Hono } from "hono";
import { Layout } from "./layout";
import { addDays, ruleWords, type Rule } from "./series";
import { berlinDate } from "./whatsapp/bot";

// The Dancer overview at "/": a Flyer feed paged by week (the default) and a month calendar with a day
// list (?view=cal), both under one row of filters kept in the URL, so a link shows the same view on
// any phone. No accounts, no cookies; the only script asks the browser for "Mein Standort".
// Decisions: .scratch/dance-calendar-mvp/issues/07-dancer-overview-prototype.md (variant D),
// 10-region-boundary.md and 23-dancer-overview.md.

type Lang = "de" | "en";

// URL parameters, all optional:
// c = kassel | goettingen | "lat,lng" (without it: Kassel and Göttingen), r = 10|25|50|100|all (default 50),
// styles = salsa,bachata,…, type = party|workshop|course|festival, view = cal, w = a week's Monday,
// d = the calendar's selected day, lang = en.
type Filters = { c: string; r: string; styles: string[]; type: string; view: string; w: string; d: string; lang: Lang };

const CENTERS: Record<string, { lat: number; lng: number; name: string }> = {
  kassel: { lat: 51.3127, lng: 9.4797, name: "Kassel" },
  goettingen: { lat: 51.5413, lng: 9.9158, name: "Göttingen" },
};
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
    region: "Kassel + Göttingen", anywhere: "überall", me: "Mein Standort", noGeo: "Standort nicht verfügbar",
    radius: "Umkreis", none: "Keine Events für diese Filter.", cancelled: "Abgesagt", tip: "von der Community hinzugefügt",
    reg: "Anmeldung nötig", intro: "Einsteigerkurs", level: "Level", price: "Eintritt", venue: "Ort", by: "Veranstaltet von",
    series: "Serie", link: "Link", styles: "Tanzstil", day: "Tag", feed: "Flyer", calendar: "Kalender", back: "Zurück",
    today: "Heute", sub: "Partnertanz in Kassel, Göttingen und drumherum",
  },
  en: {
    all: "All", party: "Party", workshop: "Workshop", course: "Course", festival: "Festival",
    parties: "Parties", workshops: "Workshops", courses: "Courses", festivals: "Festivals",
    region: "Kassel + Göttingen", anywhere: "anywhere", me: "My location", noGeo: "Location not available",
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
    c: CENTERS[c] || coordinates(c) ? c : "",
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

const centers = (f: Filters) => (f.c ? [CENTERS[f.c] ?? coordinates(f.c)!] : Object.values(CENTERS));

// Straight-line km from the chosen place (the nearer of Kassel and Göttingen by default); null when
// the Venue has no coordinates.
function distance(v: { lat: number | null; lng: number | null }, f: Filters): number | null {
  if (v.lat === null || v.lng === null) return null;
  return Math.min(...centers(f).map((c) => haversine(c, { lat: v.lat!, lng: v.lng! })));
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
  return radius === "all" || e.km === null || e.km <= Number(radius);
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

function Page(props: { f: Filters; title?: string; children: any }) {
  const t = T[props.f.lang];
  return (
    <Layout title={props.title ? `${props.title} – DanceCalendar` : "DanceCalendar"} lang={props.f.lang} head={<style>{CSS}</style>}>
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
    </Layout>
  );
}

function FilterBar(props: { f: Filters }) {
  const { f } = props;
  const t = T[f.lang];
  const place = CENTERS[f.c]?.name ?? (f.c ? t.me : t.region);
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
          📍 {r === "all" ? t.anywhere : `${place} · ${r} km`} ▾
        </summary>
        <div class="row">
          <a class={`chip ${f.c ? "" : "on"}`} href={href(f, { c: "" })}>
            {t.region}
          </a>
          {Object.entries(CENTERS).map(([k, v]) => (
            <a class={`chip ${f.c === k ? "on" : ""}`} href={href(f, { c: k })}>
              {v.name}
            </a>
          ))}
          <a class={`chip ${coordinates(f.c) ? "on" : ""}`} href={href(f, { c: "" })} data-geo data-fail={t.noGeo}>
            📍 {t.me}
          </a>
        </div>
        <div class="row">
          <span class="label">{t.radius}</span>
          {RADII.map((x) => (
            <a class={`chip ${r === x ? "on" : ""}`} href={href(f, { r: x })}>
              {x === "all" ? t.anywhere : `${x} km`}
            </a>
          ))}
        </div>
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
    <Page f={f}>
      <FilterBar f={f} />
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
          const n = byDay.get(d)!.length;
          return (
            <a class={n ? "pill" : "pill none"} href={`#day-${d}`}>
              {weekdayShort(d, f.lang)}
              <b>{Number(d.slice(8))}</b>
              {n ? <span class="cnt">{n}</span> : <span>&nbsp;</span>}
            </a>
          );
        })}
      </div>
      {[...byDay].map(([d, list]) =>
        list.length ? (
          <section>
            <h2 class="day" id={`day-${d}`}>
              {d === today ? `${t.today}, ` : ""}
              {longDay(d, f.lang)}
            </h2>
            {list.map((o) => (
              <Card f={f} o={o} />
            ))}
          </section>
        ) : null,
      )}
      {!any && <p class="empty">{t.none}</p>}
    </Page>
  );
}

function Card(props: { f: Filters; o: OnDay }) {
  const { f, o } = props;
  const { e } = o;
  const when = o.dayN ? `${T[f.lang].day} ${o.dayN}/${o.dayOf}` : timeRange(e);
  return (
    <a class={e.cancelled ? "card cancelled" : "card"} href={href(f, {}, `/events/${e.id}`)}>
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
        <b>{when}</b> · <TypeLabel f={f} e={e} /> · {e.venue}
        {km(e)}
        <br />
        <Tags f={f} e={e} />
        <div class="by">{e.posted_by}</div>
      </div>
    </a>
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
      {e.flyer_key && <img class="flyer" src={`/${e.flyer_key}`} alt="Flyer" />}
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
const weekdayShort = (iso: string, lang: Lang) => asDate(iso).toLocaleDateString(locale(lang), { weekday: "short", timeZone: "UTC" });
const monthName = (iso: string, lang: Lang) => asDate(iso).toLocaleDateString(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" });
const weekday = (iso: string) => asDate(iso).getUTCDay();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(asDate(s).getTime());
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// "Mein Standort": asks the browser once, rounds to about a kilometre and opens the same view from there.
// Without permission the link says so, and the city chips stay the way to pick a place.
const GEO_SCRIPT = `document.querySelectorAll("[data-geo]").forEach((a) => a.addEventListener("click", (ev) => {
  if (!navigator.geolocation) return;
  ev.preventDefault();
  navigator.geolocation.getCurrentPosition((p) => {
    const u = new URL(a.href, location.href);
    u.searchParams.set("c", p.coords.latitude.toFixed(2) + "," + p.coords.longitude.toFixed(2));
    location.href = u.pathname + "?" + u.searchParams.toString().replace(/%2C/g, ",");
  }, () => { a.textContent = a.dataset.fail; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}));`;

const CSS = `
  :root { --bg:#f6f4f1; --card:#fff; --ink:#1d1a17; --mute:#6f6861; --line:#e4dfd8;
          --party:#c2185b; --workshop:#1f6feb; --festival:#b26a00; --course:#2e7d32; }
  body { background:var(--bg); color:var(--ink); padding:0 0 1rem; }
  a { color:inherit; text-decoration:none; }
  footer { padding:0 16px; } footer a { text-decoration:underline; }
  header.top { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:var(--card); border-bottom:1px solid var(--line); }
  header.top .home { font-weight:700; font-size:17px; }
  header.top small { display:block; color:var(--mute); font-size:12px; }
  .lang { border:1px solid var(--line); border-radius:8px; padding:4px 8px; font-size:13px; }
  .filters { position:sticky; top:0; z-index:4; background:var(--bg); padding:8px 0 6px; border-bottom:1px solid var(--line); }
  .views, .types { display:flex; margin:0 16px 8px; background:#e9e4dd; border-radius:10px; padding:3px; }
  .views a, .types a { flex:1; text-align:center; padding:6px 0; border-radius:8px; font-size:13px; }
  .views a.on, .types a.on { background:var(--card); box-shadow:0 1px 2px rgba(0,0,0,.1); font-weight:600; }
  .types { margin:8px 16px 0; }
  .chip { display:inline-block; border:1px solid var(--line); background:var(--card); border-radius:999px; padding:5px 11px; font-size:13px; white-space:nowrap; }
  .chip.on { background:var(--ink); color:#fff; border-color:var(--ink); }
  .place { margin:0 16px 6px; }
  .place summary { list-style:none; cursor:pointer; }
  .place summary::-webkit-details-marker { display:none; }
  .place .row { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; align-items:center; }
  .place .label { font-size:12px; color:var(--mute); }
  .scroll { display:flex; gap:6px; overflow-x:auto; padding:0 16px; scrollbar-width:none; }
  .bar { display:flex; justify-content:space-between; align-items:center; padding:10px 16px 0; }
  .bar .range { font-weight:700; }
  .bar .nav a, .bar .nav .off { display:inline-block; text-align:center; line-height:30px; border:1px solid var(--line); background:var(--card); border-radius:8px; width:32px; height:32px; }
  .bar .nav .off { opacity:.35; }
  .strip { display:flex; gap:4px; justify-content:space-between; overflow-x:auto; padding:8px 16px 2px; scrollbar-width:none; }
  .pill { flex:none; width:40px; text-align:center; border-radius:12px; background:var(--card); border:1px solid var(--line); padding:4px 0; font-size:11px; }
  .pill b { display:block; font-size:16px; }
  .pill.none { opacity:.35; }
  .pill .cnt { display:inline-block; min-width:16px; border-radius:8px; background:var(--party); color:#fff; font-size:10px; }
  h2.day { padding:16px 16px 4px; margin:0; font-size:18px; scroll-margin-top:190px; }
  .card { display:block; margin:8px 16px 14px; border-radius:16px; overflow:hidden; background:var(--card); box-shadow:0 2px 8px rgba(0,0,0,.08); }
  .hero { position:relative; background:#222; }
  .hero img { display:block; width:100%; max-height:70vh; object-fit:cover; object-position:top; }
  .hero.text { background:linear-gradient(135deg,#3949ab,#8e24aa); color:#fff; font-size:24px; font-weight:800; text-align:center; padding:36px 20px; }
  .ov { position:absolute; left:0; right:0; bottom:0; padding:30px 14px 12px; background:linear-gradient(transparent, rgba(0,0,0,.8)); color:#fff; font-size:14px; }
  .ov .ttl { font-size:19px; font-weight:800; }
  .card .body { padding:10px 14px 12px; font-size:13px; }
  .card .by { color:var(--mute); margin-top:4px; }
  .card.cancelled .hero { filter:grayscale(1) brightness(.6); }
  .cancelled .ttl { text-decoration:line-through; }
  .tags { display:inline; }
  .tag { display:inline-block; font-size:11px; padding:1px 7px; border-radius:999px; background:#efe9e2; color:#4a433d; margin:3px 4px 0 0; }
  .badge { display:inline-block; font-size:11px; padding:1px 6px; border-radius:4px; font-weight:600; margin:3px 4px 0 0; }
  .b-cancel { background:#fde2e2; color:#a30000; } .b-tip { background:#e8f0fe; color:#1a4fb4; } .b-reg { background:#e6f4ea; color:#1e6b2f; }
  .t-party{color:var(--party)} .t-workshop{color:var(--workshop)} .t-festival{color:var(--festival)} .t-course{color:var(--course)}
  .muted { color:var(--mute); }
  .empty { padding:40px 16px; text-align:center; color:var(--mute); }
  .grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; padding:8px 8px 0; }
  .dow { text-align:center; font-size:11px; color:var(--mute); padding:4px 0; }
  .cell { background:var(--card); min-height:50px; border-radius:6px; padding:3px; font-size:12px; position:relative; border:2px solid transparent; }
  .cell.out { opacity:.35; } .cell.past { opacity:.5; } .cell.sel { border-color:var(--ink); }
  .cell.today .n { background:var(--party); color:#fff; border-radius:50%; }
  .cell .n { display:inline-block; width:20px; text-align:center; }
  .cell .dots { display:flex; gap:2px; flex-wrap:wrap; margin-top:2px; }
  .cell .dot { width:7px; height:7px; border-radius:50%; }
  .cell .fest { position:absolute; left:-2px; right:-2px; bottom:3px; height:5px; background:var(--festival); }
  .item { display:flex; gap:12px; background:var(--card); border-radius:12px; padding:10px; margin:0 16px 8px; border-left:5px solid var(--line); }
  .item .when { font-weight:700; min-width:56px; }
  .item .ttl, .item .muted { display:block; }
  .item .ttl { font-weight:600; } .item .muted { font-size:13px; }
  .kind { font-size:12px; font-weight:700; text-transform:uppercase; padding:0 16px; }
  h1 { margin:4px 16px; font-size:22px; }
  .badges { padding:0 0 0 0; }
  body > .badges, h1 + .badges { display:block; padding:0 16px; }
  .flyer { display:block; width:calc(100% - 32px); margin:10px 16px; border-radius:10px; }
  .facts { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:10px 16px; font-size:14px; }
  .facts dt { color:var(--mute); } .facts dd { margin:0; }
  .desc { margin:0 16px; white-space:pre-line; }
  body > p { margin:10px 16px; }
`;
