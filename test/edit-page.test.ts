import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/index";
import { berlinDate, fakeApis, flyer, knownVenue, type FlyerEvent } from "./fake-apis";
import { deliver, feed, formFrom, get, inputTag, post, runJob } from "./flow";
import { buttonReply, imageMessage, ORGANIZER_NUMBER } from "./whatsapp-fixtures";

beforeEach(async () => {
  await env.DB.batch(
    ["event", "submission", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')").bind(
      ORGANIZER_NUMBER,
    ),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name) VALUES (2, '4915200000002', 'Bachata Göttingen')"),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

const form = (fields: URLSearchParams) => [fields.toString(), { "content-type": "application/x-www-form-urlencoded" }] as const;

// Forwards a Flyer, taps [Veröffentlichen] and returns the edit links from the bot's reply.
async function publishFlyer(api: ReturnType<typeof fakeApis>) {
  await deliver(imageMessage("media1"));
  const publish = api.sent.at(-1)!.buttons.find((b) => b.title === "Veröffentlichen")!;
  await deliver(buttonReply(publish.id));
  return [...api.sent.at(-1)!.text.matchAll(/https:\/\/dancecalendar\.test\/e\/\S+/g)].map(([link]) => link);
}

// An Event already in the calendar, posted by the other Organizer.
async function otherEvent(e: { title: string; venue: string; startsAt: string; endsAt?: string; cancelled?: number }) {
  const venue =
    (await env.DB.prepare("SELECT id FROM venue WHERE name = ?").bind(e.venue).first<{ id: number }>()) ??
    (await env.DB.prepare("INSERT INTO venue (name) VALUES (?) RETURNING id").bind(e.venue).first<{ id: number }>());
  await env.DB.prepare("INSERT INTO event (title, type, starts_at, ends_at, venue_id, organizer_id, cancelled) VALUES (?, 'party', ?, ?, ?, 2, ?)")
    .bind(e.title, e.startsAt, e.endsAt ?? null, venue!.id, e.cancelled ?? 0)
    .run();
}

describe("an Event's private edit link", () => {
  it("opens the Event pre-filled, and a changed time shows in the feed", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);

    const page = await (await get(link)).text();
    expect(inputTag(page, "title.0")).toContain('value="Salsa Night"');
    expect(inputTag(page, "start_time.0")).toContain('value="21:00"');
    expect(inputTag(page, "end_time.0")).toContain('value="02:00"');
    expect(inputTag(page, "venue_name.0")).toContain('value="Kulturfabrik Salzmann"');
    const fields = formFrom(page);
    fields.set("start_time.0", "22:15");

    const res = await post(link, ...form(fields));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Gespeichert");
    const html = await feed();
    expect(html).toContain("22:15");
    expect(html).not.toContain("21:00");
  });

  it("keeps the end time past midnight and the Intro class when saved untouched", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);
    const before = await env.DB.prepare("SELECT starts_at, ends_at, intro_class_at, venue_id FROM event").first();

    await post(link, ...form(formFrom(await (await get(link)).text())));

    expect(await env.DB.prepare("SELECT starts_at, ends_at, intro_class_at, venue_id FROM event").first()).toEqual(before);
  });

  it("refuses to save without a title or with a date in the past", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);
    const fields = formFrom(await (await get(link)).text());
    fields.set("title.0", "");
    fields.set("start_date.0", berlinDate(-1));

    const res = await post(link, ...form(fields));

    expect(res.status).toBe(422);
    const html = await res.text();
    expect(inputTag(html, "title.0")).toMatch(/\bmiss\b/);
    expect(html).toContain("Vergangenheit");
    expect(await feed()).toContain("Salsa Night");
  });

  it("moves the Event to another Venue when the place is changed", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);
    const fields = formFrom(await (await get(link)).text());
    fields.set("venue_name.0", "Tanzschule Pelzer");

    await post(link, ...form(fields));

    expect(await feed()).toContain("Tanzschule Pelzer");
  });

  it("cancels the Event, which stays in the feed marked, and can take the cancellation back", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);

    const res = await post(`${link}/cancel`, "");

    expect(res.status).toBe(303);
    expect(await feed()).toMatch(/class="entry cancelled"[\s\S]*Salsa Night[\s\S]*Abgesagt/);
    const page = await (await get(link)).text();
    expect(page).toContain("abgesagt");

    await post(`${link}/reinstate`, "");

    expect(await feed()).not.toContain("entry cancelled");
  });

  it("shows the Flyer", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);

    const res = await get(`${link}/flyer`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("answers an unknown link with 404", async () => {
    expect((await get("http://dancecalendar.test/e/nope")).status).toBe(404);
    expect((await post("http://dancecalendar.test/e/nope/cancel", "")).status).toBe(404);
  });
});

describe("a likely duplicate (same Venue, overlapping time)", () => {
  const night = (days: number, time: string) => `${berlinDate(days)}T${time}`;

  // In the chat it's a question (test/questions.test.ts).
  it("is warned about on the confirm page, even after keeping both in the chat", async () => {
    await otherEvent({ title: "Bachata Party", venue: "Kulturfabrik Salzmann", startsAt: night(3, "20:00") });
    const api = fakeApis();
    await deliver(imageMessage("media1"));
    await deliver(buttonReply(api.sent.at(-1)!.buttons.find((b) => b.title === "Beide behalten")!.id));
    await deliver(buttonReply(api.sent.at(-1)!.buttons.find((b) => b.title === "Ändern ✏️")!.id));
    const link = api.sent.at(-1)!.text.match(/https:\/\/dancecalendar\.test\/c\/\S+/)![0];

    const html = await (await get(link)).text();

    expect(html).toContain("Bachata Party");
    expect(html).toContain("doppelt?");
  });

  it("is warned about after an edit moves the Event onto another one", async () => {
    await otherEvent({ title: "Bachata Party", venue: "Tanzschule Pelzer", startsAt: night(3, "21:30"), endsAt: night(3, "23:30") });
    const api = fakeApis();
    const [link] = await publishFlyer(api);
    expect(await (await get(link)).text()).not.toContain("doppelt?");
    const fields = formFrom(await (await get(link)).text());
    fields.set("venue_name.0", "Tanzschule Pelzer");

    const res = await post(link, ...form(fields));

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Gespeichert");
    expect(html).toContain("Bachata Party");
    expect(html).toContain("doppelt?");
  });

  it("is not warned about for another time, another Venue, a cancelled Event, or Events from the same Flyer", async () => {
    await otherEvent({ title: "Afternoon Tea Dance", venue: "Kulturfabrik Salzmann", startsAt: night(3, "15:00"), endsAt: night(3, "18:00") });
    await otherEvent({ title: "Kizomba Night", venue: "Tanzschule Pelzer", startsAt: night(3, "21:00") });
    await otherEvent({ title: "Abgesagte Party", venue: "Kulturfabrik Salzmann", startsAt: night(3, "21:00"), cancelled: 1 });
    const workshop: Partial<FlyerEvent> = { title: "Salsa Workshop", type: "workshop", start_time: "20:00", end_time: "", intro_class_time: "" };
    const api = fakeApis({ extraction: flyer([workshop, {}]) });

    const links = await publishFlyer(api);

    expect(api.texts().join("\n")).not.toContain("doppelt?");
    for (const link of links) expect(await (await get(link)).text()).not.toContain("doppelt?");
  });
});

describe("an Organizer's web upload", () => {
  it("is reachable from the edit page, goes through extraction into the confirm page, and publishes under that Organizer", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);
    const sentBefore = api.sent.length;
    expect(await (await get(link)).text()).toContain(`/e/${link.split("/e/")[1]}/upload`);
    const send = vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
    const body = new FormData();
    body.append("flyer", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "flyer.jpg", { type: "image/jpeg" }));

    const res = await post(`${link}/upload`, body);

    expect(res.status).toBe(303);
    const waiting = new URL(res.headers.get("location")!, link).href;
    expect(await (await get(waiting)).text()).toContain("ausgelesen");
    const job = send.mock.calls[0][0] as Job;
    api.anthropicCalls.length = 0;
    await runJob(job);
    const ready = await get(waiting);
    expect(ready.status).toBe(303);
    const confirm = new URL(ready.headers.get("location")!, link).href;
    const page = await (await get(confirm)).text();
    expect(page).toContain("Hallo Ana");
    const fields = formFrom(page);
    fields.set("title.0", "Salsa Night II");

    await post(confirm, ...form(fields));

    expect(await feed()).toContain("Salsa Night II");
    const row = await env.DB.prepare("SELECT organizer_id FROM event WHERE title = 'Salsa Night II'").first<{ organizer_id: number }>();
    expect(row!.organizer_id).toBe(1);
    expect(api.anthropicCalls).toHaveLength(1);
    expect(api.sent).toHaveLength(sentBefore);
  });

  it("refuses a file that isn't an image", async () => {
    const api = fakeApis();
    const [link] = await publishFlyer(api);
    const body = new FormData();
    body.append("flyer", new File(["hello"], "flyer.txt", { type: "text/plain" }));

    expect((await post(`${link}/upload`, body)).status).toBe(400);
  });
});
