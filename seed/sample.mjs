// Sample data for the local calendar: invented Venues, Organizers and Events for this week and the next five,
// each with a typographic sample Flyer marked "Beispiel". Everything here is made up; nothing points to real
// people or places beyond the towns and their districts.
//
//   node seed/sample.mjs            fill (or refill) the local D1 and R2 used by `wrangler dev`
//   node seed/sample.mjs --remove   take the sample data out again
//   add --remote to either           the same on the deployed site (its D1 and its R2 bucket in the EU)
//
// Local unless --remote is given. Ids from 9000 on, so it never touches other rows.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = "dancecalendar";
const BUCKET = "dancecalendar-flyers";
const remove = process.argv.includes("--remove");
const remote = process.argv.includes("--remote");

const wrangler = (args) => execFileSync("npx", ["wrangler", ...args, remote ? "--remote" : "--local"], { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });

// ---- Dates (Europe/Berlin) ----
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
const monday = addDays(today, -((weekday(today) + 6) % 7));
const dayOf = (week, wd) => addDays(monday, week * 7 + ((wd + 6) % 7)); // wd: 1 = Monday … 0 = Sunday
const endAt = (date, start, end) => (end <= start ? `${addDays(date, 1)}T${end}` : `${date}T${end}`);
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });

// ---- The cast ----
const venues = [
  [9001, "Tanzhaus am Weinberg", "Kassel-Südstadt", 51.3068, 9.4921],
  [9002, "Salón am Fuldaufer", "Kassel-Unterneustadt", 51.3149, 9.5083],
  [9003, "Kulturbahnhof Nord", "Kassel-Nordstadt", 51.3262, 9.4968],
  [9004, "Studio Wilhelmshöhe", "Kassel-Bad Wilhelmshöhe", 51.3131, 9.4471],
  [9005, "Halle am Leineufer", "Göttingen-Weststadt", 51.5352, 9.9196],
  [9006, "Tanzbar Zentral", "Göttingen-Innenstadt", 51.5331, 9.9352],
  [9007, "Bürgerhaus am Stadtpark", "Baunatal", 51.2551, 9.4103],
  [9008, "Alte Brauerei", "Hann. Münden", 51.4163, 9.6521],
  [9009, "Tanzschule Seitenwechsel", "Kassel-Wehlheiden", null, null], // no coordinates: listed under the map
];
const organizers = [
  [9001, "+49000000009001", "Lena Hoffmann"],
  [9002, "+49000000009002", "Marco Rossi"],
  [9003, "+49000000009003", "Ayo Mensah"],
  [9004, "+49000000009004", "Jule Brandt"],
  [9005, "+49000000009005", "Sami Haddad"],
];

const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Recurring nights:[key, title, type, styles, weekday, start, end, venue, organizer, extras]
const nights = [
  ["bachata-mo", "Bachata Social", "party", ["bachata"], 1, "20:30", "23:30", 9006, 9002, { intro: "19:30", price: "6 €", colour: ["#5b2a86", "#f6c945"] }],
  ["urbankiz-di", "Urban Kiz Practica", "party", ["urban_kiz", "kizomba"], 2, "20:00", "22:30", 9009, 9003, { price: "5 €", colour: ["#1d3557", "#a8dadc"] }],
  ["salsa-mi", "Salsa am Mittwoch", "party", ["salsa"], 3, "21:00", "01:00", 9003, 9001, { intro: "20:00", price: "7 €", colour: ["#d62828", "#fcbf49"] }],
  ["kizomba-fr", "Kizomba Night", "party", ["kizomba", "urban_kiz"], 5, "21:30", "02:00", 9002, 9003, { price: "10 €", colour: ["#0b3d3a", "#e9c46a"] }],
  ["latina-sa", "Noche Latina", "party", ["salsa", "bachata"], 6, "21:00", "02:00", 9001, 9001, { intro: "20:00", price: "10 €, ermäßigt 7 €", colour: ["#e76f51", "#fff3e0"] }],
  ["afternoon-so", "Latin Afternoon", "party", ["salsa", "bachata", "kizomba"], 0, "15:00", "19:00", 9008, 9001, { price: "8 €", colour: ["#f4a261", "#264653"] }],
];
const flyers = {
  ...Object.fromEntries(nights.map(([key, title, , styles, wd, start, end, venue, , x]) => [key, { title, styles, when: `Jeden ${WD[wd]} · ${start}–${end}`, venue, colour: x.colour }])),
  course: { title: "Salsa für Einsteiger", styles: ["salsa"], when: "Kurs · donnerstags 19:00–20:30", venue: 9004, colour: ["#2a9d8f", "#ffffff"] },
  workshop: { title: "Bachata Sensual Workshop", styles: ["bachata"], when: "Samstag · 15:00–18:00", venue: 9005, colour: ["#3d0e61", "#ff8fab"] },
  wcs: { title: "West Coast Swing Practice", styles: ["west_coast_swing"], when: "Sonntag · 18:00–21:00", venue: 9007, colour: ["#14213d", "#fca311"] },
  festival: { title: "Kassel Latin Weekend", styles: ["salsa", "bachata", "kizomba"], when: "", venue: 9001, colour: ["#9d0208", "#ffba08"] },
  tip: { title: "Salsa im Stadtteilzentrum", styles: ["salsa"], when: "Samstag · 19:00–23:00", venue: 9003, colour: ["#6a994e", "#f2e8cf"] },
};

const STYLE_NAMES = { salsa: "Salsa", bachata: "Bachata", kizomba: "Kizomba", urban_kiz: "Urban Kiz", west_coast_swing: "West Coast Swing" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// A portrait poster: the styles, the title large, when and where, and a "Beispiel" mark.
function flyerSvg(f, whenText) {
  const [bg, fg] = f.colour;
  const venue = venues.find((v) => v[0] === f.venue);
  const words = f.title.split(" ");
  const lines = [];
  for (const w of words) {
    const last = lines.at(-1);
    if (last && (last + " " + w).length <= 11) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const size = lines.some((l) => l.length > 9) ? 76 : 92;
  const title = lines.map((l, i) => `<text x="300" y="${330 + i * size * 1.02}" font-size="${size}" font-weight="800" text-anchor="middle" letter-spacing="-2">${esc(l.toUpperCase())}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 600 840">
  <rect width="600" height="840" fill="${bg}"/>
  <circle cx="520" cy="110" r="190" fill="${fg}" opacity=".14"/><circle cx="60" cy="760" r="240" fill="${fg}" opacity=".1"/>
  <g fill="${fg}" font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif">
    <text x="300" y="140" font-size="26" font-weight="700" text-anchor="middle" letter-spacing="6">${esc(f.styles.map((s) => STYLE_NAMES[s]).join(" · ").toUpperCase())}</text>
    <rect x="200" y="170" width="200" height="4"/>
    ${title}
    <text x="300" y="640" font-size="30" font-weight="700" text-anchor="middle">${esc(whenText || f.when)}</text>
    <text x="300" y="690" font-size="26" text-anchor="middle" font-family="Arial, sans-serif">${esc(venue[1])}</text>
    <text x="300" y="726" font-size="22" text-anchor="middle" font-family="Arial, sans-serif" opacity=".8">${esc(venue[2])}</text>
  </g>
  <g transform="translate(470 790) rotate(-8)"><rect x="-70" y="-24" width="140" height="40" rx="6" fill="#fff"/><text y="5" font-size="20" font-weight="700" text-anchor="middle" fill="#1f3038" font-family="Arial, sans-serif">BEISPIEL</text></g>
</svg>`;
}

// ---- Events ----
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const events = [];
let id = 9000;
const add = (e) => events.push({ id: ++id, cancelled: 0, is_tip: 0, organizer: null, shown_as: null, series: null, ...e });
const WEEKS = [0, 1, 2, 3, 4, 5];

for (const w of WEEKS) {
  for (const [key, title, type, styles, wd, start, end, venue, organizer, x] of nights) {
    const date = dayOf(w, wd);
    add({ title, type, styles, starts_at: `${date}T${start}`, ends_at: endAt(date, start, end), intro: x.intro && `${date}T${x.intro}`, price: x.price, venue, organizer, flyer: key,
      description: x.intro ? `Ab ${x.intro} Einsteigerkurs, danach Social Dancing.` : "Social Dancing mit DJ.", cancelled: key === "kizomba-fr" && w === 1 ? 1 : 0 });
  }
  // The course: a Series of Workshops with registration (Kurs).
  const thu = dayOf(w, 4);
  add({ title: "Salsa für Einsteiger", type: "workshop", styles: ["salsa"], starts_at: `${thu}T19:00`, ends_at: `${thu}T20:30`, level: "Einsteiger", price: "60 € für 6 Abende",
    venue: 9004, organizer: 9001, flyer: "course", series: 9001, description: "Sechs Abende Grundschritte, Drehungen und Führen und Folgen. Ohne Partner möglich." });
  if (w % 2 === 0) {
    const sat = dayOf(w, 6);
    add({ title: "Bachata Sensual Workshop", type: "workshop", styles: ["bachata"], starts_at: `${sat}T15:00`, ends_at: `${sat}T18:00`, level: "Mittelstufe", price: "35 €",
      venue: 9005, organizer: 9002, flyer: "workshop", description: "Wellen, Körperisolation und Musikalität. Paare und Einzelne willkommen." });
  }
  if (w % 2 === 1) {
    const sun = dayOf(w, 0);
    add({ title: "West Coast Swing Practice", type: "party", styles: ["west_coast_swing"], starts_at: `${sun}T18:00`, ends_at: `${sun}T21:00`, intro: `${sun}T17:00`, price: "5 €",
      venue: 9007, organizer: 9004, flyer: "wcs", description: "Offene Practice, um 17:00 eine Stunde Basics." });
  }
}
// One Festival over a weekend, one Tip from the community.
const fri = dayOf(2, 5);
const sun = addDays(fri, 2);
add({ title: "Kassel Latin Weekend", type: "festival", styles: ["salsa", "bachata", "kizomba"], starts_at: `${fri}T18:00`, ends_at: `${sun}T23:00`, price: "Festivalpass 89 €",
  venue: 9001, organizer: 9005, flyer: "festival", flyerWhen: `${long(fri)} – ${long(sun)}`, description: "Drei Tage Workshops und Partys auf zwei Floors. Partypässe an der Abendkasse." });
const tipDay = dayOf(0, 6) >= today ? dayOf(0, 6) : dayOf(1, 6);
add({ title: "Salsa im Stadtteilzentrum", type: "party", styles: ["salsa"], starts_at: `${tipDay}T19:00`, ends_at: `${tipDay}T23:00`, price: "Eintritt frei",
  venue: 9003, is_tip: 1, shown_as: "Salsa Freunde Kassel", flyer: "tip" });

// ---- SQL ----
const remover = [
  "DELETE FROM event WHERE id >= 9000",
  "DELETE FROM series WHERE id >= 9000",
  "DELETE FROM venue WHERE id >= 9000",
  "DELETE FROM organizer WHERE id >= 9000",
];
const sql = [...remover];
if (!remove) {
  for (const [vid, name, address, lat, lng] of venues) sql.push(`INSERT INTO venue (id, name, address, lat, lng) VALUES (${q(vid)}, ${q(name)}, ${q(address)}, ${q(lat)}, ${q(lng)})`);
  for (const [oid, number, name] of organizers) sql.push(`INSERT INTO organizer (id, whatsapp_number, name) VALUES (${q(oid)}, ${q(number)}, ${q(name)})`);
  // generated_until far ahead, so the Series cron leaves the sample alone.
  sql.push(`INSERT INTO series (id, organizer_id, rule, template, registration_required, last_sign_of_life, generated_until) VALUES (9001, 9001, ${q(JSON.stringify({ freq: "weekly", anchor: dayOf(0, 4) }))}, '{}', 1, ${q(today)}, '2099-12-31')`);
  for (const e of events) {
    const key = e.flyer ? `flyers/sample-${e.flyer}${e.flyerWhen ? "-" + e.id : ""}.svg` : null;
    e.flyer_key = key;
    sql.push(`INSERT INTO event (id, title, type, styles, starts_at, ends_at, intro_class_at, level, description, price, venue_id, organizer_id, shown_as, is_tip, flyer_key, series_id, cancelled)
      VALUES (${[e.id, e.title, e.type, JSON.stringify(e.styles), e.starts_at, e.ends_at, e.intro ?? null, e.level ?? null, e.description ?? null, e.price ?? null, e.venue, e.organizer, e.shown_as, e.is_tip, key, e.series, e.cancelled].map(q).join(", ")})`);
  }
}

const dir = mkdtempSync(join(tmpdir(), "dc-sample-"));
try {
  const file = join(dir, "sample.sql");
  writeFileSync(file, sql.join(";\n") + ";\n");
  wrangler(["d1", "execute", DB, "--file", file]);
  if (!remove) {
    const done = new Set();
    for (const e of events) {
      if (!e.flyer_key || done.has(e.flyer_key)) continue;
      done.add(e.flyer_key);
      const svg = join(dir, e.flyer_key.replace("flyers/", ""));
      writeFileSync(svg, flyerSvg(flyers[e.flyer], e.flyerWhen));
      wrangler(["r2", "object", "put", `${BUCKET}/${e.flyer_key}`, "--file", svg, "--content-type", "image/svg+xml", ...(remote ? ["--jurisdiction", "eu"] : [])]);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(remove ? "Sample data removed." : `${events.length} sample Events from ${monday} to ${addDays(monday, WEEKS.length * 7 - 1)} loaded into the ${remote ? "deployed" : "local"} calendar.`);
