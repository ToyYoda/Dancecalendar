import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { InboundMessage } from "../src/whatsapp/types";
import { berlinDate, fakeApis, flyer } from "./fake-apis";
import { buttonReply, documentMessage, imageMessage, ORGANIZER_NUMBER, textMessage } from "./whatsapp-fixtures";

const STRANGER = "4917600000009";

// Runs one inbound message through the queue consumer, as the queue would after the webhook.
async function deliver(payload: any) {
  const message: InboundMessage = payload.entry[0].changes[0].value.messages[0];
  const batch = createMessageBatch("dancecalendar-jobs", [{ id: message.id, timestamp: new Date(), attempts: 1, body: message }]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);
  expect(result.retryMessages).toEqual([]);
}

async function feed() {
  return (await exports.default.fetch("http://dancecalendar.test/")).text();
}

beforeEach(async () => {
  await env.DB.batch(
    ["event", "submission", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')")
    .bind(ORGANIZER_NUMBER)
    .run();
});

afterEach(() => vi.restoreAllMocks());

describe("a registered Organizer forwards a Flyer", () => {
  it("greets a new number once, with the AI disclosure, privacy link, human route and STOP", async () => {
    const api = fakeApis();

    await deliver(imageMessage("media1"));
    await deliver(imageMessage("media2"));

    const greetings = api.texts().filter((t) => t.includes("KI"));
    expect(greetings).toHaveLength(1);
    expect(greetings[0]).toContain("https://dancecalendar.test/datenschutz");
    expect(greetings[0]).toContain("Admin");
    expect(greetings[0]).toContain("STOP");
  });

  it("replies with a summary of the extracted Events and the three buttons", async () => {
    const api = fakeApis({ extraction: flyer([{}, { title: "Bachata Sunday", start_date: berlinDate(5), start_time: "19:00" }]) });

    await deliver(imageMessage("media1"));

    expect(api.anthropicCalls).toHaveLength(1);
    expect(api.anthropicCalls[0].model).toBe("claude-sonnet-5-5");
    const summary = api.sent.at(-1)!;
    expect(summary.to).toBe(ORGANIZER_NUMBER);
    expect(summary.text).toContain("2 Events");
    expect(summary.text).toContain("Salsa Night");
    expect(summary.text).toContain("Bachata Sunday");
    expect(summary.buttons.map((b) => b.title)).toEqual(["Veröffentlichen", "Ändern ✏️", "Verwerfen"]);
  });

  it("marks fields the model or the code checks found uncertain", async () => {
    const api = fakeApis({ extraction: flyer([{ uncertain_fields: ["venue_name"] }]) });

    await deliver(imageMessage("media1"));

    expect(api.sent.at(-1)!.text).toMatch(/⚠️.*Ort/);
  });

  it("publishes the Events on Veröffentlichen and sends a private edit link per Event", async () => {
    const api = fakeApis();
    await deliver(imageMessage("media1"));
    const publish = api.sent.at(-1)!.buttons.find((b) => b.title === "Veröffentlichen")!;

    await deliver(buttonReply(publish.id));

    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("Kulturfabrik Salzmann");
    const reply = api.sent.at(-1)!.text;
    expect(reply).toContain("Ist online");
    const link = reply.match(/https:\/\/dancecalendar\.test\/e\/\S+/)![0];
    const page = await exports.default.fetch(link.replace("https://dancecalendar.test", "http://dancecalendar.test"));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Salsa Night");
  });

  it("reuses a known Venue instead of creating it again", async () => {
    await env.DB.prepare("INSERT INTO venue (id, name, address) VALUES (7, 'Kulturfabrik  salzmann', 'Kassel')").run();
    const api = fakeApis();
    await deliver(imageMessage("media1"));

    await deliver(buttonReply(api.sent.at(-1)!.buttons[0].id));

    const { results } = await env.DB.prepare("SELECT venue_id FROM event").all<{ venue_id: number }>();
    expect(results).toEqual([{ venue_id: 7 }]);
  });

  it("leaves out an Event without a start time, says so, and publishes the rest", async () => {
    const api = fakeApis({
      extraction: flyer([{}, { title: "Weihnachtsfeier", start_date: berlinDate(4), start_time: "" }]),
    });
    await deliver(imageMessage("media1"));
    expect(api.sent.at(-1)!.text).toMatch(/Weihnachtsfeier[\s\S]*ohne Uhrzeit/);

    await deliver(buttonReply(api.sent.at(-1)!.buttons[0].id));

    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).not.toContain("Weihnachtsfeier");
  });

  it("shows the year when an Event is not in the year the Flyer arrived", async () => {
    const nextYear = Number(berlinDate(0).slice(0, 4)) + 1;
    const api = fakeApis({ extraction: flyer([{ start_date: `${nextYear}-01-15` }]) });

    await deliver(imageMessage("media1"));

    expect(api.sent.at(-1)!.text).toContain(`15.01.${nextYear}`);
  });

  it("won't publish an Event dated before the Flyer arrived", async () => {
    const api = fakeApis({ extraction: flyer([{ start_date: berlinDate(-3) }]) });

    await deliver(imageMessage("media1"));

    expect(api.sent.at(-1)!.text).toContain("liegt in der Vergangenheit");
    expect(api.sent.at(-1)!.buttons.map((b) => b.title)).toEqual(["Verwerfen"]);
  });

  it("won't publish a guessed date almost a year away, which suggests last year's Flyer", async () => {
    const api = fakeApis({ extraction: flyer([{ start_date: berlinDate(300), uncertain_fields: ["start_date"] }]) });

    await deliver(imageMessage("media1"));

    expect(api.sent.at(-1)!.text).toContain("vom letzten Jahr");
    expect(api.sent.at(-1)!.buttons.map((b) => b.title)).toEqual(["Verwerfen"]);
  });

  it("offers only Verwerfen when no Event can be published", async () => {
    const api = fakeApis({ extraction: flyer([{ start_time: "" }]) });

    await deliver(imageMessage("media1"));

    expect(api.sent.at(-1)!.buttons.map((b) => b.title)).toEqual(["Verwerfen"]);
  });

  it("discards the Flyer on Verwerfen", async () => {
    const api = fakeApis();
    await deliver(imageMessage("media1"));
    const discard = api.sent.at(-1)!.buttons.find((b) => b.title === "Verwerfen")!;

    await deliver(buttonReply(discard.id));
    // A late tap on Veröffentlichen for the same Flyer must not publish it.
    await deliver(buttonReply(discard.id.replace("discard", "publish")));

    expect(await feed()).not.toContain("Salsa Night");
    expect(api.texts()).toContain("Verworfen.");
  });

  it("says when the image is not an event Flyer", async () => {
    const api = fakeApis({ extraction: { ...flyer([]), is_event_flyer: false } });

    await deliver(imageMessage("media1"));

    expect(api.sent.at(-1)!.text).toContain("keine Tanzveranstaltung");
  });

  it("asks for an image when the Flyer comes as a document", async () => {
    const api = fakeApis();

    await deliver(documentMessage());

    expect(api.sent.at(-1)!.text).toContain("als Bild");
    expect(api.anthropicCalls).toHaveLength(0);
  });
});

describe("chat commands and unknown senders", () => {
  it("tells an unregistered sender that posting is invitation-only for now, without reading the Flyer", async () => {
    const api = fakeApis();

    await deliver(imageMessage("media1", STRANGER));

    expect(api.sent.every((m) => m.to === STRANGER)).toBe(true);
    expect(api.sent.at(-1)!.text).toContain("eingeladene");
    expect(api.anthropicCalls).toHaveLength(0);
  });

  it("stops replying after STOP and starts again after START", async () => {
    const api = fakeApis();

    await deliver(textMessage("STOP"));
    const afterStop = api.sent.length;
    await deliver(imageMessage("media1"));
    expect(api.sent.length).toBe(afterStop);

    await deliver(textMessage("start"));
    expect(api.sent.length).toBeGreaterThan(afterStop);
    expect(api.anthropicCalls).toHaveLength(0);
  });

  it("records a request for a human when someone writes Admin", async () => {
    const api = fakeApis();

    await deliver(textMessage("Admin"));

    expect(api.sent.at(-1)!.text).toContain("Bescheid");
    const row = await env.DB.prepare("SELECT whatsapp_number FROM admin_request").first();
    expect(row).toEqual({ whatsapp_number: ORGANIZER_NUMBER });
  });
});
