import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { berlinDate } from "./fake-apis";
import { get } from "./flow";

// Venues: 1 Kassel, 2 Göttingen, 3 Fulda (about 80 km from both), 4 without coordinates.
beforeEach(async () => {
  await env.DB.batch([
    ...["event", "series", "venue", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name) VALUES (1, '+4915200000001', 'Salsa Kassel')"),
    env.DB.prepare(
      `INSERT INTO venue (id, name, address, lat, lng) VALUES
         (1, 'Kulturfabrik Salzmann', 'Sandershäuser Str. 34, 34123 Kassel', 51.31, 9.53),
         (2, 'Musa', 'Hagenweg 2a, 37081 Göttingen', 51.55, 9.92),
         (3, 'Mea Mea Lounge', 'Fulda', 50.55, 9.68),
         (4, 'Tanzschule Pelzer', NULL, NULL, NULL)`,
    ),
  ]);
});

type Ev = {
  title: string;
  day?: number;
  time?: string;
  type?: string;
  styles?: string[];
  venue?: number;
  ends?: string;
  intro?: string;
  cancelled?: number;
  tip?: boolean;
  flyer?: string;
  series?: number;
};

async function add(e: Ev) {
  const date = berlinDate(e.day ?? 1);
  await env.DB.prepare(
    `INSERT INTO event (title, type, styles, starts_at, ends_at, intro_class_at, venue_id, organizer_id, shown_as, is_tip, cancelled, flyer_key, series_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      e.title,
      e.type ?? "party",
      JSON.stringify(e.styles ?? ["salsa"]),
      `${date}T${e.time ?? "21:00"}`,
      e.ends ?? null,
      e.intro ? `${date}T${e.intro}` : null,
      e.venue ?? 1,
      e.tip ? null : 1,
      e.tip ? "Salsa Freunde" : null,
      e.tip ? 1 : 0,
      e.cancelled ?? 0,
      e.flyer ?? null,
      e.series ?? null,
    )
    .run();
}

const page = async (query = "") => (await get(`http://dancecalendar.test/${query}`)).text();

describe("the Flyer feed", () => {
  it("shows today and the next 7 days everywhere, without km, until a place is known", async () => {
    await add({ title: "Gestern Party", day: -1 });
    await add({ title: "Heute Party", day: 0, time: "23:30" });
    await add({ title: "Göttingen Party", day: 2, venue: 2 });
    await add({ title: "Fulda Party", day: 2, venue: 3 });
    await add({ title: "Ferne Party", day: 8 });

    const html = await page();

    expect(html).toContain("Heute Party");
    expect(html).toContain("Göttingen Party");
    expect(html).toContain("Fulda Party");
    expect(html).toContain("Kulturfabrik Salzmann");
    expect(html).toContain("Salsa Kassel");
    expect(html).not.toContain("Gestern Party");
    expect(html).not.toContain("Ferne Party");
    expect(html).not.toMatch(/\d km/);
    expect(html).toContain('class="hint"'); // allow the location or pick a place on the map
    expect(html).toContain("data-autogeo"); // the browser is asked for the position
  });

  it("has no city chips, only my location and a place on the map", async () => {
    const html = await page();

    expect(html).not.toContain("Kassel + Göttingen");
    expect(html).not.toContain("c=kassel");
    expect(html).not.toContain("c=goettingen");
    expect(html).toContain("Mein Standort");
    expect(html).toContain('href="/karte"');
    expect(html).not.toContain("r=10"); // no radius without a place
    expect(await page("?c=51.31,9.48")).toContain("r=10");
  });

  it("treats an old city link like no place", async () => {
    await add({ title: "Fulda Party", venue: 3 });

    const html = await page("?c=kassel&r=25");

    expect(html).toContain("Fulda Party");
    expect(html).not.toMatch(/\d km/);
  });

  it("loads nothing from other sites until the map is opened", async () => {
    expect(await page()).not.toContain("openfreemap");
  });

  it("opens a Göttingen-only, Bachata-only, Party-only link with the right Events", async () => {
    await add({ title: "Bachata Göttingen", venue: 2, styles: ["bachata"] });
    await add({ title: "Salsa Göttingen", venue: 2, styles: ["salsa"] });
    await add({ title: "Bachata Kassel", venue: 1, styles: ["bachata"] });
    await add({ title: "Bachata Workshop Göttingen", venue: 2, styles: ["bachata"], type: "workshop" });
    await add({ title: "Ohne Stil Göttingen", venue: 2, styles: [] });

    const html = await page("?c=51.54,9.92&r=25&styles=bachata&type=party");

    expect(html).toContain("Bachata Göttingen");
    expect(html).not.toContain("Salsa Göttingen");
    expect(html).not.toContain("Bachata Kassel");
    expect(html).not.toContain("Bachata Workshop Göttingen");
    expect(html).not.toContain("Ohne Stil Göttingen"); // hidden once a style is picked
    expect(await page("?c=51.54,9.92&r=25")).toContain("Ohne Stil Göttingen");
  });

  it("shows far-away Events with überall, and Events at a Venue without coordinates always", async () => {
    await add({ title: "Fulda Party", venue: 3 });
    await add({ title: "Pelzer Party", venue: 4 });

    expect(await page("?c=51.54,9.92&r=all")).toContain("Fulda Party");
    expect(await page("?c=51.54,9.92&r=10")).not.toContain("Fulda Party");
    expect(await page("?c=51.54,9.92&r=10")).toContain("Pelzer Party");
  });

  it("takes a shared location, rounded to about a kilometre", async () => {
    await add({ title: "Kassel Party" });

    const html = await page("?c=51.32,9.50&r=10");

    expect(html).toContain("Kassel Party");
    expect(html).toMatch(/\d km/);
    expect(await page("?c=51.55,9.92&r=10")).not.toContain("Kassel Party");
  });

  it("counts Parties with an Intro class as Workshops, and Courses by their Series", async () => {
    await add({ title: "Party mit Kurs", intro: "20:00" });
    await add({ title: "Party ohne Kurs" });
    await env.DB.prepare(
      "INSERT INTO series (id, organizer_id, rule, registration_required, last_sign_of_life) VALUES (7, 1, ?, 1, ?)",
    )
      .bind(JSON.stringify({ freq: "weekly", anchor: berlinDate(1) }), berlinDate(0))
      .run();
    await add({ title: "Bachata Kurs", type: "workshop", series: 7 });

    const workshops = await page("?type=workshop");
    expect(workshops).toContain("Party mit Kurs");
    expect(workshops).not.toContain("Party ohne Kurs");
    const courses = await page("?type=course");
    expect(courses).toContain("Bachata Kurs");
    expect(courses).toContain("Anmeldung nötig");
    expect(courses).toContain("Jeden ");
    expect(courses).not.toContain("Party mit Kurs");
  });

  it("shows a Festival on every day it runs", async () => {
    await add({ title: "Latin Festival", type: "festival", day: 1, time: "18:00", ends: `${berlinDate(3)}T02:00` });

    const html = await page();

    expect(html.match(/Latin Festival/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Tag 2/3");
    expect(html).toContain("Tag 3/3");
  });

  it("marks cancelled Events and Tips, and shows Tips under the name from their Flyer", async () => {
    await add({ title: "Abgesagte Party", cancelled: 1 });
    await add({ title: "Tipp Party", tip: true });

    const html = await page();

    expect(html).toMatch(/class="card cancelled"/);
    expect(html).toContain("Abgesagt");
    expect(html).toContain("von der Community hinzugefügt");
    expect(html).toContain("Salsa Freunde");
  });

  it("pages by week, keeping the filters", async () => {
    await add({ title: "Später Party", day: 12 });

    const html = await page("?styles=salsa");
    const next = html.match(/href="(\/\?[^"]*w=\d{4}-\d{2}-\d{2}[^"]*)"[^>]*>›/)![1].replace(/&amp;/g, "&");

    expect(next).toContain("styles=salsa");
    const later = await page(next.slice(1));
    const w = new URLSearchParams(next.slice(2)).get("w")!;
    if (berlinDate(12) <= plusDays(w, 6)) expect(later).toContain("Später Party");
  });

  it("is in English with lang=en", async () => {
    await add({ title: "Salsa Night", intro: "20:00" });
    const html = await page("?lang=en");
    expect(html).toContain('lang="en"');
    expect(html).toContain("Parties");
    expect(html).toContain("Intro class");
  });
});

describe("the calendar view", () => {
  it("shows the month with the selected day's Events, and keeps the filters", async () => {
    await add({ title: "Kassel Salsa", day: 2 });
    await add({ title: "Göttingen Salsa", day: 2, venue: 2 });

    const html = await page(`?view=cal&c=51.31,9.48&r=25&d=${berlinDate(2)}`);

    expect(html).toContain("Kassel Salsa");
    expect(html).not.toContain("Göttingen Salsa");
    expect(html).toMatch(/class="cell[^"]*sel/);
    // Switching back to the feed keeps the place.
    expect(html).toMatch(/href="\/\?c=51.31,9.48&amp;r=25"/);
  });
});

describe("the map to pick a place", () => {
  it("loads MapLibre from this site and the tiles from OpenFreeMap, and goes back with the filters kept", async () => {
    const html = await page("karte?styles=salsa&c=51.31,9.48&lang=en");

    expect(html).toContain('src="/vendor/maplibre-gl.js"');
    expect(html).toContain('href="/vendor/maplibre-gl.css"');
    expect(html).toContain("tiles.openfreemap.org");
    expect(html).toContain('data-center="51.31,9.48"');
    expect(html).toContain('data-back="/?styles=salsa&amp;lang=en"'); // the picked place is added as c
    expect(html).toContain('lang="en"');
  });

  it("is linked from the place filter, keeping the other filters", async () => {
    expect(await page("?styles=bachata")).toContain('href="/karte?styles=bachata"');
  });
});

describe("an Event's details", () => {
  it("open from the feed with the Flyer and everything known about the Event", async () => {
    await add({ title: "Salsa Night", intro: "20:00", flyer: "flyers/abc.jpg" });
    const html = await page("?styles=salsa");
    const link = html.match(/href="(\/events\/\d+[^"]*)"/)![1].replace(/&amp;/g, "&");

    const details = await page(link.slice(1));

    expect(details).toContain("Salsa Night");
    expect(details).toContain("Sandershäuser Str. 34");
    expect(details).toContain('src="/flyers/abc.jpg"');
    expect(details).toContain('href="/?styles=salsa"');
  });
});

describe("Flyer images", () => {
  it("are served from R2 with long cache headers, only for Flyers of published Events", async () => {
    await env.FLYERS.put("flyers/abc.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { httpMetadata: { contentType: "image/jpeg" } });
    await env.FLYERS.put("flyers/held.jpg", new Uint8Array([0xff, 0xd8]), { httpMetadata: { contentType: "image/jpeg" } });
    await add({ title: "Salsa Night", flyer: "flyers/abc.jpg" });

    const res = await get("http://dancecalendar.test/flyers/abc.jpg");

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect((await get("http://dancecalendar.test/flyers/held.jpg")).status).toBe(404);
  });
});

function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
