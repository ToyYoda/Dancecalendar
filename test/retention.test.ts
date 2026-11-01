import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { cleanUpPast } from "../src/retention";
import { addDays } from "../src/series";
import { berlinDate, knownVenue } from "./fake-apis";

const TODAY = "2026-11-01"; // a fixed clock: Events before 2026-08-03 are past the 90 days

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "series", "submission", "inbound_message", "venue", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, '4917600000001', 'Salsa Kassel', 'Ana')"),
    knownVenue(env.DB),
  ]);
});

async function addEvent(id: number, startsAt: string, e: { endsAt?: string; flyer?: string; series?: number } = {}) {
  await env.DB.prepare(
    "INSERT INTO event (id, title, type, starts_at, ends_at, venue_id, organizer_id, flyer_key, series_id, edit_token) VALUES (?, ?, 'party', ?, ?, 1, 1, ?, ?, ?)",
  )
    .bind(id, `Event ${id}`, startsAt, e.endsAt ?? null, e.flyer ?? null, e.series ?? null, `edit-${id}`)
    .run();
}

async function addSeries(id: number, lastSignOfLife: string, e: { endedAt?: string; flyer?: string } = {}) {
  const template = { title: `Series ${id}`, type: "party", styles: "[]", start_time: "21:00", end_time: "", intro_class_time: "", level: null, description: null, price: null, venue_id: 1, flyer_key: e.flyer ?? null };
  await env.DB.prepare(
    "INSERT INTO series (id, organizer_id, rule, template, last_sign_of_life, generated_until, ended_at, edit_token) VALUES (?, 1, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, JSON.stringify({ freq: "weekly", anchor: lastSignOfLife }), JSON.stringify(template), lastSignOfLife, lastSignOfLife, e.endedAt ?? null, `s-${id}`)
    .run();
}

async function addSubmission(id: string, status: string, createdAt: string, flyer: string, source = "whatsapp") {
  await env.DB.prepare(
    "INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, status, created_at, source) VALUES (?, ?, ?, ?, '{}', ?, ?, ?)",
  )
    .bind(id, source === "tip" ? null : 1, flyer, createdAt.slice(0, 10), status, createdAt, source)
    .run();
}

const ids = async (table: string) =>
  (await env.DB.prepare(`SELECT id FROM ${table} ORDER BY id`).all<{ id: number | string }>()).results.map((r) => r.id);

describe("retention", () => {
  it("deletes Events about 3 months after they happened, and keeps the rest", async () => {
    await addEvent(1, "2026-07-20T21:00");
    await addEvent(2, "2026-08-02T21:00", { endsAt: "2026-08-03T02:00" }); // ended on the cut-off day
    await addEvent(3, "2026-07-31T10:00", { endsAt: "2026-08-04T18:00" }); // a Festival that ended later
    await addEvent(4, "2026-10-30T21:00");

    await cleanUpPast(env, TODAY);

    expect(await ids("event")).toEqual([2, 3, 4]);
  });

  it("deletes their Flyers in R2 unless something still shows them", async () => {
    await env.FLYERS.put("flyers/old.jpg", "x");
    await env.FLYERS.put("flyers/shared.jpg", "x");
    await addEvent(1, "2026-07-01T21:00", { flyer: "flyers/old.jpg" });
    await addEvent(2, "2026-07-01T21:00", { flyer: "flyers/shared.jpg" });
    await addEvent(3, "2026-10-30T21:00", { flyer: "flyers/shared.jpg" });

    await cleanUpPast(env, TODAY);

    expect(await env.FLYERS.get("flyers/old.jpg")).toBeNull();
    expect(await env.FLYERS.get("flyers/shared.jpg")).not.toBeNull();
  });

  it("keeps a Flyer a running Series still uses for its next dates", async () => {
    await env.FLYERS.put("flyers/series.jpg", "x");
    await addSeries(1, "2026-10-20", { flyer: "flyers/series.jpg" });
    await addEvent(1, "2026-07-03T21:00", { flyer: "flyers/series.jpg", series: 1 });

    await cleanUpPast(env, TODAY);

    expect(await ids("event")).toEqual([]);
    expect(await env.FLYERS.get("flyers/series.jpg")).not.toBeNull();
    expect(await ids("series")).toEqual([1]);
  });

  it("deletes a Series long over once it has no Events left, with its Flyer", async () => {
    await env.FLYERS.put("flyers/ran-out.jpg", "x");
    await env.FLYERS.put("flyers/ended.jpg", "x");
    await addSeries(1, "2026-04-01", { flyer: "flyers/ran-out.jpg" }); // ran out 2026-06-24
    await addSeries(2, "2026-10-01", { endedAt: "2026-07-01 12:00:00", flyer: "flyers/ended.jpg" });
    await addSeries(3, "2026-04-01"); // ran out, but still has an Event inside the 90 days
    await addEvent(1, "2026-08-10T21:00", { series: 3 });
    await addSeries(4, "2026-10-01", { endedAt: "2026-10-20 12:00:00" }); // ended recently

    await cleanUpPast(env, TODAY);

    expect(await ids("series")).toEqual([3, 4]);
    expect(await env.FLYERS.get("flyers/ran-out.jpg")).toBeNull();
    expect(await env.FLYERS.get("flyers/ended.jpg")).toBeNull();
  });

  it("deletes handled submissions after 3 months and abandoned ones after 30 days, leaving Tips to their own clean-up", async () => {
    await env.FLYERS.put("flyers/abandoned.jpg", "x");
    await env.FLYERS.put("flyers/tip.jpg", "x");
    await addSubmission("published-old", "published", "2026-07-01 10:00:00", "flyers/a.jpg");
    await addSubmission("discarded-old", "discarded", "2026-07-01 10:00:00", "flyers/b.jpg");
    await addSubmission("published-new", "published", "2026-10-01 10:00:00", "flyers/c.jpg");
    await addSubmission("abandoned", "pending", "2026-09-20 10:00:00", "flyers/abandoned.jpg");
    await addSubmission("waiting", "pending", "2026-10-25 10:00:00", "flyers/d.jpg");
    await addSubmission("tip", "pending", "2026-09-20 10:00:00", "flyers/tip.jpg", "tip");

    await cleanUpPast(env, TODAY);

    expect(await ids("submission")).toEqual(["published-new", "tip", "waiting"]);
    expect(await env.FLYERS.get("flyers/abandoned.jpg")).toBeNull();
    expect(await env.FLYERS.get("flyers/tip.jpg")).not.toBeNull();
  });

  it("forgets WhatsApp message ids after a week", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO inbound_message (message_id, received_at) VALUES ('old', '2026-10-20 10:00:00')"),
      env.DB.prepare("INSERT INTO inbound_message (message_id, received_at) VALUES ('new', '2026-10-30 10:00:00')"),
    ]);

    await cleanUpPast(env, TODAY);

    const { results } = await env.DB.prepare("SELECT message_id FROM inbound_message").all();
    expect(results).toEqual([{ message_id: "new" }]);
  });

  it("runs with the daily cron, before the Series generate their dates", async () => {
    await addEvent(1, `${addDays(berlinDate(0), -120)}T21:00`);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: "30 2 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await ids("event")).toEqual([]);
  });
});
