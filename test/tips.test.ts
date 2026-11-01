import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { berlinDate, fakeApis, flyer, knownVenue } from "./fake-apis";
import { deliver, feed, formFrom, get, post } from "./flow";
import { buttonReply, imageMessage, ORGANIZER_NUMBER } from "./whatsapp-fixtures";

const STRANGER = "4917600000009";
const ADMIN = { authorization: `Basic ${btoa("admin:test-admin-secret")}` };
const QUEUE = "http://dancecalendar.test/admin/tips";
const weekly = flyer([{ series: { is_series: true, rule_text: "jeden Freitag", frequency: "weekly", explicit_dates: [] } }]);

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "series", "submission", "application", "venue", "admin_request", "contact", "organizer"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')").bind(
      ORGANIZER_NUMBER,
    ),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

type Api = ReturnType<typeof fakeApis>;
const last = (api: Api) => api.sent.at(-1)!;
const tap = (api: Api, title: string, from = ORGANIZER_NUMBER) =>
  deliver(buttonReply(api.sent.findLast((m) => m.buttons.some((b) => b.title === title))!.buttons.find((b) => b.title === title)!.id, from));
const form = (fields: URLSearchParams) => [fields.toString(), { "content-type": "application/x-www-form-urlencoded", ...ADMIN }] as const;

// A stranger sends a Flyer and answers "Nein, ist ein Tipp".
async function sendTip(api: Api, media = "media1") {
  await deliver(imageMessage(media, STRANGER));
  await tap(api, "Nein, ist ein Tipp", STRANGER);
}

// The review page of the only Tip waiting in the queue.
async function reviewPage() {
  const list = await (await get(QUEUE, ADMIN)).text();
  const href = list.match(/href="(\/admin\/tips\/[^"/]+)"/)![1];
  const url = `http://dancecalendar.test${href}`;
  return { url, html: await (await get(url, ADMIN)).text() };
}

async function approve(shownAs?: string) {
  const { url, html } = await reviewPage();
  const fields = formFrom(html);
  if (shownAs !== undefined) fields.set("shown_as", shownAs);
  return post(url, ...form(fields));
}

async function runCron(cron = "17 * * * *") {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron }), env, ctx);
  await waitOnExecutionContext(ctx);
}

describe("a Tip", () => {
  it("is read on Nein, thanked for and held for the Admin, not published", async () => {
    const api = fakeApis();

    await sendTip(api);

    expect(last(api).text).toContain("Danke für den Tipp");
    expect(last(api).buttons).toEqual([]);
    expect(api.texts().at(-2)).toContain("Ich lese deinen Flyer"); // at once after Nein
    expect(api.anthropicCalls).toHaveLength(1);
    const row = await env.DB.prepare("SELECT organizer_id, source, status FROM submission").first();
    expect(row).toEqual({ organizer_id: null, source: "tip", status: "pending" });
    expect(await feed()).not.toContain("Salsa Night");
  });

  it("is remembered per number: the next Flyer is a Tip without asking", async () => {
    const api = fakeApis();
    await sendTip(api);
    const before = api.sent.length;

    await deliver(imageMessage("media2", STRANGER));

    expect(api.sent.slice(before).map((m) => m.text)).toEqual([expect.stringContaining("Ich lese deinen Flyer"), expect.stringContaining("Danke für den Tipp")]);
    const { results } = await env.DB.prepare("SELECT id FROM submission WHERE source = 'tip'").all();
    expect(results).toHaveLength(2);
  });

  it("that shows no dance Event is not held", async () => {
    const api = fakeApis({ extraction: { is_event_flyer: false, flyer_language: "other", display_name_on_flyer: "", events: [] } });

    await sendTip(api);

    expect(last(api).text).toContain("keine Tanzveranstaltung");
    expect(await env.DB.prepare("SELECT id FROM submission").first()).toBeNull();
  });

  it("can't be opened through the Organizers' confirm page", async () => {
    const api = fakeApis();
    await sendTip(api);
    const { confirm_token } = (await env.DB.prepare("SELECT confirm_token FROM submission").first<{ confirm_token: string }>())!;

    expect((await get(`http://dancecalendar.test/c/${confirm_token}`)).status).toBe(404);
    expect((await get(`${QUEUE}/${confirm_token}`)).status).toBe(401);
  });
});

describe("the Admin's Tip review", () => {
  it("lists waiting Tips and shows them in the confirm-page cards with the Flyer's name", async () => {
    const api = fakeApis();
    await sendTip(api);

    const { html } = await reviewPage();

    expect(html).toContain("Salsa Night");
    expect(html).toContain('name="title.0"');
    expect(html).toMatch(/name="shown_as"[^>]*value="Salsa Kassel"/);
    expect(html).toContain("1 Event freigeben");
    expect(html).toContain("Ablehnen");
  });

  it("publishes on Freigeben, marked as from the community under the chosen name", async () => {
    const api = fakeApis();
    await sendTip(api);
    const sent = api.sent.length;

    const res = await approve("Latin Nights Kassel");

    expect(res.status).toBe(200);
    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("von der Community hinzugefügt");
    expect(html).toContain("Latin Nights Kassel");
    const e = await env.DB.prepare("SELECT organizer_id, is_tip, shown_as FROM event").first();
    expect(e).toEqual({ organizer_id: null, is_tip: 1, shown_as: "Latin Nights Kassel" });
    expect(api.sent.length).toBe(sent); // the tipper gets no news
    expect(await (await get(QUEUE, ADMIN)).text()).not.toContain("/admin/tips/");
  });

  it("needs a name to show the Tip under", async () => {
    const api = fakeApis();
    await sendTip(api);

    const res = await approve("");

    expect(res.status).toBe(422);
    expect(await env.DB.prepare("SELECT id FROM event").first()).toBeNull();
  });

  it("deletes the Tip and its Flyer at once on Ablehnen", async () => {
    const api = fakeApis();
    await sendTip(api);
    const { url } = await reviewPage();
    const { flyer_key } = (await env.DB.prepare("SELECT flyer_key FROM submission").first<{ flyer_key: string }>())!;
    const sent = api.sent.length;

    const res = await post(`${url}/reject`, "", ADMIN);

    expect(res.status).toBe(303);
    expect(await env.DB.prepare("SELECT id FROM submission").first()).toBeNull();
    expect(await env.FLYERS.get(flyer_key)).toBeNull();
    expect(await feed()).not.toContain("Salsa Night");
    expect(api.sent.length).toBe(sent);
  });

  it("publishes a Tip Series without an Organizer, every date shown under the Tip's name", async () => {
    const api = fakeApis({ extraction: weekly });
    await sendTip(api);

    await approve();

    const series = await env.DB.prepare("SELECT organizer_id, shown_as FROM series").first();
    expect(series).toEqual({ organizer_id: null, shown_as: "Salsa Kassel" });
    const { results } = await env.DB.prepare("SELECT organizer_id, is_tip, shown_as FROM event").all();
    expect(results.length).toBeGreaterThan(1);
    expect(new Set(results.map((r) => JSON.stringify(r)))).toEqual(new Set([JSON.stringify({ organizer_id: null, is_tip: 1, shown_as: "Salsa Kassel" })]));
  });
});

describe("an Organizer's Event that is likely the same as a Tip Event", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, title, type, starts_at, ends_at, venue_id, shown_as, is_tip) VALUES (99, 'Latin Afterwork', 'party', ?, ?, 1, 'Community Salsa', 1)",
    )
      .bind(`${berlinDate(3)}T21:00`, `${berlinDate(4)}T01:00`)
      .run();
  });

  it("is asked about, and on Ja only the Organizer's Event remains", async () => {
    const api = fakeApis();

    await deliver(imageMessage("media1"));

    expect(last(api).text).toContain("„Latin Afterwork“ (von der Community)");
    expect(last(api).text).toContain("Ist das dasselbe?");
    expect(last(api).buttons.map((b) => b.title)).toEqual(["Ja, dasselbe", "Nein, beide"]);
    await tap(api, "Ja, dasselbe");
    expect(last(api).buttons.map((b) => b.title)).toContain("Veröffentlichen");
    await tap(api, "Veröffentlichen");

    const { results } = await env.DB.prepare("SELECT title, is_tip FROM event").all();
    expect(results).toEqual([{ title: "Salsa Night", is_tip: 0 }]);
  });

  it("keeps both on Nein, without asking again whether it's a duplicate", async () => {
    const api = fakeApis();
    await deliver(imageMessage("media1"));

    await tap(api, "Nein, beide");

    expect(last(api).text).not.toContain("doppelt?");
    await tap(api, "Veröffentlichen");
    const { results } = await env.DB.prepare("SELECT id FROM event").all();
    expect(results).toHaveLength(2);
  });

  it("replaces the Tip Event when published from the confirm page after Ja", async () => {
    const api = fakeApis();
    await deliver(imageMessage("media1"));
    await tap(api, "Ja, dasselbe");
    await tap(api, "Ändern ✏️");
    const link = last(api).text.match(/https:\/\/dancecalendar\.test\/c\/\S+/)![0];
    const html = await (await get(link)).text();
    expect(html).toContain("Ersetzt den Community-Tipp „Latin Afterwork“");

    await post(link, formFrom(html).toString(), { "content-type": "application/x-www-form-urlencoded" });

    const { results } = await env.DB.prepare("SELECT title FROM event").all();
    expect(results).toEqual([{ title: "Salsa Night" }]);
  });
});

describe("Tip data", () => {
  it("waiting longer than 30 days is deleted with its Flyer by the cron", async () => {
    const api = fakeApis();
    await sendTip(api);
    const { flyer_key } = (await env.DB.prepare("SELECT flyer_key FROM submission").first<{ flyer_key: string }>())!;
    await env.DB.prepare("UPDATE submission SET created_at = datetime('now', '-31 days')").run();

    await runCron();

    expect(await env.DB.prepare("SELECT id FROM submission").first()).toBeNull();
    expect(await env.FLYERS.get(flyer_key)).toBeNull();
  });

  it("keeps a number's Tip answer for 30 days after its last Tip", async () => {
    const api = fakeApis();
    await sendTip(api);
    await env.DB.prepare("UPDATE contact SET tip_at = datetime('now', '-29 days')").run();
    await runCron();
    expect((await env.DB.prepare("SELECT tip_at FROM contact").first<{ tip_at: string | null }>())!.tip_at).not.toBeNull();

    await env.DB.prepare("UPDATE contact SET tip_at = datetime('now', '-31 days')").run();
    await runCron();

    expect((await env.DB.prepare("SELECT tip_at FROM contact").first<{ tip_at: string | null }>())!.tip_at).toBeNull();
    await deliver(imageMessage("media2", STRANGER));
    expect(last(api).text).toContain("Ist das deine Veranstaltung?");
  });
});
