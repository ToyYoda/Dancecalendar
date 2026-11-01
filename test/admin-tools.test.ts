import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { digestDue, sendDailyEmail } from "../src/admin-email";
import worker from "../src/index";
import { addDays } from "../src/series";
import { berlinDate, fakeApis, knownVenue } from "./fake-apis";
import { deliver, feed, get, post } from "./flow";
import { imageMessage, ORGANIZER_NUMBER } from "./whatsapp-fixtures";

const ADMIN = { authorization: `Basic ${btoa("admin:test-admin-secret")}` };
const BASE = "http://dancecalendar.test/admin";
const FORM = { "content-type": "application/x-www-form-urlencoded", ...ADMIN };
const today = () => berlinDate(0);

const template = (title: string, flyerKey: string | null = null) =>
  JSON.stringify({ title, type: "party", styles: "[]", start_time: "21:00", end_time: "", intro_class_time: "", level: null, description: null, price: null, venue_id: 1, flyer_key: flyerKey });

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "series", "submission", "application", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name, created_at) VALUES (1, ?, 'Salsa Kassel', 'Ana', datetime('now', '-30 days'))").bind(ORGANIZER_NUMBER),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name, created_at) VALUES (2, '4917600000002', 'Bachata Göttingen', 'Ben', datetime('now', '-20 days'))"),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

async function addEvent(e: { id: number; title: string; days: number; organizer?: number | null; tip?: boolean; series?: number; flyer?: string }) {
  await env.DB.prepare(
    `INSERT INTO event (id, title, type, starts_at, venue_id, organizer_id, is_tip, shown_as, series_id, flyer_key, edit_token)
     VALUES (?, ?, 'party', ?, 1, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(e.id, e.title, `${berlinDate(e.days)}T21:00`, e.organizer === undefined ? 1 : e.organizer, e.tip ? 1 : 0, e.tip ? "Die Community" : null,
      e.series ?? null, e.flyer ?? null, `edit-${e.id}`)
    .run();
}

// A weekly Series that last showed a sign of life `ago` days ago, with dates generated up to `until`.
async function addSeries(s: { id: number; title: string; ago: number; organizer?: number | null; custom?: boolean; flyer?: string }) {
  const anchor = berlinDate(-s.ago);
  const rule = s.custom ? { freq: "custom", text: "jeden zweiten und vierten Freitag", anchor } : { freq: "weekly", anchor };
  await env.DB.prepare(
    `INSERT INTO series (id, organizer_id, shown_as, rule, template, last_sign_of_life, generated_until, edit_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(s.id, s.organizer === undefined ? 1 : s.organizer, s.organizer === null ? "Die Community" : null, JSON.stringify(rule),
      template(s.title, s.flyer ?? null), anchor, addDays(anchor, -1), `series-${s.id}`)
    .run();
}

const html = async (path: string) => (await get(`${BASE}${path}`, ADMIN)).text();
const send = (path: string, fields: Record<string, string> = {}) => post(`${BASE}${path}`, new URLSearchParams(fields).toString(), FORM);

describe("the Admin home", () => {
  it("is behind the password and links every tool", async () => {
    expect((await get(`${BASE}/`)).status).toBe(401);
    const page = await html("/");
    for (const href of ["/admin/organizers", "/admin/events", "/admin/series", "/admin/venues", "/admin/tips", "/admin/upload"]) {
      expect(page).toContain(`href="${href}"`);
    }
  });
});

describe("Organizers", () => {
  it("are listed newest first", async () => {
    const page = await html("/organizers");
    expect(page.indexOf("Bachata Göttingen")).toBeLessThan(page.indexOf("Salsa Kassel"));
  });

  it("Entfernen blocks the number, deletes future Events, ends their Series and keeps past Events", async () => {
    await addEvent({ id: 1, title: "Past Party", days: -3 });
    await addEvent({ id: 2, title: "Future Party", days: 4, flyer: "flyers/future.jpg" });
    await addEvent({ id: 3, title: "Other Party", days: 4, organizer: 2 });
    await env.FLYERS.put("flyers/future.jpg", "x");
    await addSeries({ id: 1, title: "Salsa Friday", ago: 1 });
    await env.DB.prepare("UPDATE series SET generated_until = '' WHERE id = 1").run();

    const res = await send("/organizers/1/remove");

    expect(res.status).toBe(303);
    const o = await env.DB.prepare("SELECT blocked_at FROM organizer WHERE id = 1").first<{ blocked_at: string | null }>();
    expect(o!.blocked_at).not.toBeNull();
    const titles = (await env.DB.prepare("SELECT title FROM event ORDER BY id").all<{ title: string }>()).results.map((r) => r.title);
    expect(titles).toEqual(["Past Party", "Other Party"]);
    expect(await env.FLYERS.get("flyers/future.jpg")).toBeNull();
    expect((await env.DB.prepare("SELECT ended_at FROM series WHERE id = 1").first<{ ended_at: string | null }>())!.ended_at).not.toBeNull();
    expect(await feed()).not.toContain("Future Party");

    // The daily cron generates nothing for the ended Series.
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: "30 2 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM event WHERE series_id = 1").first<{ n: number }>())!.n).toBe(0);
  });

  it("a removed Organizer's next Flyer is refused by the bot", async () => {
    await send("/organizers/1/remove");
    const api = fakeApis();

    await deliver(imageMessage("media1", ORGANIZER_NUMBER));

    expect(api.sent.at(-1)!.text).toBe("Du kannst hier keine Events mehr eintragen.");
    expect(api.anthropicCalls).toHaveLength(0);
  });

  it("show a removed Organizer as removed", async () => {
    await send("/organizers/1/remove");
    expect(await html("/organizers")).toContain("entfernt");
  });
});

describe("Events", () => {
  it("are searched, upcoming first, and open the Organizer's edit page", async () => {
    await addEvent({ id: 1, title: "Salsa Past", days: -3 });
    await addEvent({ id: 2, title: "Salsa Later", days: 9 });
    await addEvent({ id: 3, title: "Salsa Soon", days: 2 });
    await addEvent({ id: 4, title: "Kizomba Night", days: 2, organizer: 2 });

    const page = await html("/events?q=salsa");

    expect(page).not.toContain("Kizomba Night");
    expect(page.indexOf("Salsa Soon")).toBeLessThan(page.indexOf("Salsa Later"));
    expect(page.indexOf("Salsa Later")).toBeLessThan(page.indexOf("Salsa Past"));
    const detail = await html("/events/3");
    expect(detail).toContain('href="/e/edit-3"');
  });

  it("finds Events by Organizer and Venue", async () => {
    await addEvent({ id: 1, title: "Party One", days: 2, organizer: 2 });
    expect(await html("/events?q=bachata")).toContain("Party One");
    expect(await html("/events?q=salzmann")).toContain("Party One");
  });

  it("Organizer zuweisen turns a Tip Event into the Organizer's Event", async () => {
    await addEvent({ id: 1, title: "Tip Party", days: 2, organizer: null, tip: true });

    const res = await send("/events/1/assign", { organizer_id: "2" });

    expect(res.status).toBe(303);
    const e = await env.DB.prepare("SELECT organizer_id, is_tip, shown_as FROM event WHERE id = 1").first();
    expect(e).toEqual({ organizer_id: 2, is_tip: 0, shown_as: null });
    expect(await feed()).not.toContain("von der Community");
  });

  it("Organizer zuweisen on a Series moves the whole Series and its dates to come", async () => {
    await addSeries({ id: 1, title: "Tip Friday", ago: 1, organizer: null });
    await env.DB.prepare("UPDATE series SET generated_until = '' WHERE id = 1").run();
    await addEvent({ id: 1, title: "Tip Friday", days: 3, organizer: null, tip: true, series: 1 });

    await send("/events/1/assign", { organizer_id: "1" });

    expect(await env.DB.prepare("SELECT organizer_id, shown_as FROM series WHERE id = 1").first()).toEqual({ organizer_id: 1, shown_as: null });
    const { results } = await env.DB.prepare("SELECT DISTINCT organizer_id, is_tip FROM event WHERE series_id = 1").all();
    expect(results).toEqual([{ organizer_id: 1, is_tip: 0 }]);
  });

  it("can't be assigned to a removed Organizer", async () => {
    await addEvent({ id: 1, title: "Tip Party", days: 2, organizer: null, tip: true });
    await send("/organizers/2/remove");

    const res = await send("/events/1/assign", { organizer_id: "2" });

    expect(res.status).toBe(422);
    expect((await env.DB.prepare("SELECT organizer_id FROM event WHERE id = 1").first())!.organizer_id).toBeNull();
  });

  it("Flyer entfernen deletes the image everywhere and keeps the Events", async () => {
    await env.FLYERS.put("flyers/a.jpg", "x");
    await addSeries({ id: 1, title: "Salsa Friday", ago: 1, flyer: "flyers/a.jpg" });
    await addEvent({ id: 1, title: "Salsa Friday", days: 3, series: 1, flyer: "flyers/a.jpg" });
    await addEvent({ id: 2, title: "Workshop", days: 3, flyer: "flyers/a.jpg" });

    const res = await send("/events/1/flyer/remove");

    expect(res.status).toBe(303);
    expect(await env.FLYERS.get("flyers/a.jpg")).toBeNull();
    const { results } = await env.DB.prepare("SELECT flyer_key FROM event").all();
    expect(results).toEqual([{ flyer_key: null }, { flyer_key: null }]);
    const s = await env.DB.prepare("SELECT template FROM series WHERE id = 1").first<{ template: string }>();
    expect(JSON.parse(s!.template).flyer_key).toBeNull();
    expect((await get("http://dancecalendar.test/flyers/a.jpg")).status).toBe(404);
  });
});

describe("Series ending soon", () => {
  it("lists running Series that run out within 4 weeks, soonest first", async () => {
    await addSeries({ id: 1, title: "Ends In 2 Weeks", ago: 70 });
    await addSeries({ id: 2, title: "Ends In 1 Week", ago: 77 });
    await addSeries({ id: 3, title: "Fresh Series", ago: 10 });
    await addSeries({ id: 4, title: "Custom Rule", ago: 77, custom: true });

    const page = await html("/series");

    expect(page).not.toContain("Fresh Series");
    expect(page).not.toContain("Custom Rule");
    expect(page.indexOf("Ends In 1 Week")).toBeLessThan(page.indexOf("Ends In 2 Weeks"));
    expect(page).toContain('href="/s/series-1"');
  });

  it("12 Wochen verlängern counts as a sign of life and generates the dates", async () => {
    await addSeries({ id: 1, title: "Ends In 1 Week", ago: 77 });

    const res = await send("/series/1/extend");

    expect(res.status).toBe(303);
    const s = await env.DB.prepare("SELECT last_sign_of_life, generated_until FROM series WHERE id = 1").first<{ last_sign_of_life: string; generated_until: string }>();
    expect(s!.last_sign_of_life).toBe(today());
    expect(s!.generated_until >= addDays(today(), 77)).toBe(true);
    expect(await html("/series")).not.toContain("Ends In 1 Week");
  });
});

describe("the review queue", () => {
  it("lists free-text Series rules next to Tips, linked to their Series page", async () => {
    await addSeries({ id: 1, title: "Odd Friday", ago: 0, custom: true });

    const page = await html("/tips");

    expect(page).toContain("jeden zweiten und vierten Freitag");
    expect(page).toContain('href="/s/series-1"');
  });
});

describe("Venues", () => {
  it("are corrected by name, address and coordinates", async () => {
    const res = await send("/venues/1", { name: "Salzmann", address: "Sandershäuser Str. 34, 34123 Kassel", lat: "51.3201", lng: "9.5402" });

    expect(res.status).toBe(303);
    expect(await env.DB.prepare("SELECT name, address, lat, lng FROM venue WHERE id = 1").first()).toEqual({
      name: "Salzmann",
      address: "Sandershäuser Str. 34, 34123 Kassel",
      lat: 51.3201,
      lng: 9.5402,
    });
  });

  it("look up an address with the geocoder before saving", async () => {
    fakeApis({ places: { "Sandershäuser": { name: "", street: "Sandershäuser Straße", housenumber: "34", postcode: "34123", city: "Kassel", lat: 51.32, lng: 9.54 } } });

    const res = await send("/venues/1", { name: "Kulturfabrik Salzmann", address: "Sandershäuser Str. 34", lat: "", lng: "", action: "geocode" });

    const page = await res.text();
    expect(page).toContain('value="51.32"');
    expect(page).toContain("Sandershäuser Straße 34, 34123 Kassel");
    // Nothing is saved until Speichern.
    expect((await env.DB.prepare("SELECT lat FROM venue WHERE id = 1").first())!.lat).toBe(51.31);
  });

  it("refuse a name another Venue has, since Venues are matched by name", async () => {
    await env.DB.prepare("INSERT INTO venue (id, name) VALUES (2, 'Tanzschule Kassel')").run();

    const res = await send("/venues/1", { name: "tanzschule  kassel", address: "", lat: "", lng: "" });

    expect(res.status).toBe(422);
    expect((await env.DB.prepare("SELECT name FROM venue WHERE id = 1").first())!.name).toBe("Kulturfabrik Salzmann");
  });

  it("refuse coordinates that aren't numbers", async () => {
    const res = await send("/venues/1", { name: "Kulturfabrik Salzmann", address: "", lat: "north", lng: "9.5" });
    expect(res.status).toBe(422);
  });
});

describe("the daily email", () => {
  // 21:00 in Berlin is 19:00 UTC in summer (CEST) and 20:00 UTC in winter (CET).
  it("is due at 21:00 German time on both sides of daylight-saving time", () => {
    expect(digestDue(new Date("2026-07-15T19:00:00Z"))).toBe(true);
    expect(digestDue(new Date("2026-07-15T20:00:00Z"))).toBe(false);
    expect(digestDue(new Date("2026-12-15T20:00:00Z"))).toBe(true);
    expect(digestDue(new Date("2026-12-15T19:00:00Z"))).toBe(false);
  });

  function mailbox() {
    const sent: EmailMessageBuilder[] = [];
    const EMAIL = { send: vi.fn(async (m: EmailMessageBuilder) => (sent.push(m), { messageId: "m1" })) } as unknown as SendEmail;
    return { sent, env: { ...env, EMAIL, ADMIN_EMAIL: "admin@example.test", EMAIL_FROM: "bot@example.test" } };
  }

  async function runCron(e: Env, at: Date) {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: at.getTime(), cron: "0 19,20 * * *" }), e, ctx);
    await waitOnExecutionContext(ctx);
  }

  it("isn't sent when nothing is pending", async () => {
    const box = mailbox();
    expect(await sendDailyEmail(box.env, new Date())).toBe("nothing");
    expect(box.sent).toEqual([]);
  });

  it("lists Tips, free-text rules, new Organizers and Series ending within 7 days, each with its Admin link", async () => {
    const box = mailbox();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, confirm_token, source)
         VALUES ('t1', NULL, 'flyers/t.jpg', ?, ?, 'tip-token', 'tip')`,
      ).bind(today(), JSON.stringify({ events: [{ title: "Kizomba Tip", start_date: berlinDate(5) }] })),
      env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (3, '4917600000003', 'Salsa Kassel', 'Carla')"),
      env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (4, '4917600000004', 'WCS Göttingen', 'Dana')"),
    ]);
    await addEvent({ id: 1, title: "Carla's Party", days: 6, organizer: 3 });
    await addSeries({ id: 1, title: "Odd Friday", ago: 0, custom: true });
    await addSeries({ id: 2, title: "Ends In 5 Days", ago: 79 });
    await addSeries({ id: 3, title: "Ends In 2 Weeks", ago: 70 });

    expect(await sendDailyEmail(box.env, new Date())).toBe("sent");

    expect(box.sent).toHaveLength(1);
    const m = box.sent[0];
    expect(m.to).toBe("admin@example.test");
    expect(m.from).toEqual({ name: "DanceCalendar", email: "bot@example.test" });
    const text = m.text!;
    expect(text).toContain("Kizomba Tip");
    expect(text).toContain("https://dancecalendar.test/admin/tips/tip-token");
    expect(text).toContain("jeden zweiten und vierten Freitag");
    expect(text).toContain("https://dancecalendar.test/s/series-1");
    expect(text).toContain("Salsa Kassel (Carla)");
    expect(text).toContain("Carla's Party");
    expect(text).toContain("tritt dem bestehenden Display name „Salsa Kassel“ bei");
    expect(text).toContain("WCS Göttingen (Dana)");
    expect(text).toContain("noch kein Event");
    expect(text).toContain("https://dancecalendar.test/admin/organizers");
    expect(text).toContain("Ends In 5 Days");
    expect(text).toContain("https://dancecalendar.test/admin/series");
    expect(text).not.toContain("Ends In 2 Weeks");
    expect(text).not.toContain("Bachata Göttingen"); // joined 20 days ago, not new
  });

  it("is sent by the cron only at 21:00 German time", async () => {
    const box = mailbox();
    await addSeries({ id: 1, title: "Odd Friday", ago: 0, custom: true });

    await runCron(box.env, new Date("2026-12-15T19:00:00Z"));
    expect(box.sent).toHaveLength(0);
    await runCron(box.env, new Date("2026-12-15T20:00:00Z"));
    expect(box.sent).toHaveLength(1);
  });

  it("can be sent by hand from the Admin home", async () => {
    await addSeries({ id: 1, title: "Odd Friday", ago: 0, custom: true });
    // Without the email binding (as in tests) the page says so instead of failing.
    const page = await (await send("/email")).text();
    expect(page).toContain("nicht eingerichtet");
  });
});
