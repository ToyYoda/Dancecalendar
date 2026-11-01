import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { fakeApis, flyer } from "./fake-apis";
import { deliver, feed, formFrom, get, post } from "./flow";
import { buttonReply, imageMessage, ORGANIZER_NUMBER, textMessage } from "./whatsapp-fixtures";

const STRANGER = "4917600000009";

beforeEach(async () => {
  await env.DB.batch(
    ["event", "submission", "application", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')")
    .bind(ORGANIZER_NUMBER)
    .run();
});

afterEach(() => vi.restoreAllMocks());

const form = (fields: URLSearchParams) => [fields.toString(), { "content-type": "application/x-www-form-urlencoded" }] as const;
const button = (api: ReturnType<typeof fakeApis>, title: string) => api.sent.findLast((m) => m.buttons.some((b) => b.title === title))!.buttons.find((b) => b.title === title)!;

// A stranger sends a Flyer and answers "Ja, meine"; returns the apply link from the bot's reply.
async function applyLink(api: ReturnType<typeof fakeApis>) {
  await deliver(imageMessage("media1", STRANGER));
  await deliver(buttonReply(button(api, "Ja, meine").id, STRANGER));
  return api.texts().findLast((t) => t.includes("/a/"))!.match(/https:\/\/dancecalendar\.test\/a\/\S+/)![0];
}

function filled(html: string, displayName: string) {
  const fields = formFrom(html);
  fields.set("display_name", displayName);
  fields.set("first_name", "Ben");
  fields.set("terms", "on");
  return fields;
}

async function runCron() {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: "17 * * * *" }), env, ctx);
  await waitOnExecutionContext(ctx);
}

describe("an unregistered sender's Flyer", () => {
  it("is held while the bot asks whether it's their own Event", async () => {
    const api = fakeApis();

    await deliver(imageMessage("media1", STRANGER));

    const question = api.sent.at(-1)!;
    expect(question.to).toBe(STRANGER);
    expect(question.text).toContain("Ist das deine Veranstaltung?");
    expect(question.buttons.map((b) => b.title)).toEqual(["Ja, meine", "Nein, ist ein Tipp"]);
    expect(api.anthropicCalls).toHaveLength(0);
  });

  it("gets a private apply link on Ja, and the Flyer is read meanwhile", async () => {
    const api = fakeApis();

    const link = await applyLink(api);

    expect(api.texts().at(-1)).toContain("24 Stunden");
    expect(api.anthropicCalls).toHaveLength(1);
    const html = await (await get(link)).text();
    expect(html).toContain('name="display_name"');
    expect(html).toContain('name="first_name"');
    expect(html).toContain('name="terms"');
    expect(html).toContain("Salsa Kassel"); // suggested to join
  });

  it("makes the sender an Organizer on submit, and the bot continues with the summary at once", async () => {
    const api = fakeApis();
    const link = await applyLink(api);

    const res = await post(link, ...form(filled(await (await get(link)).text(), "Bachata Göttingen")));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Fertig! Zurück zu WhatsApp");
    const summary = api.sent.at(-1)!;
    expect(summary.to).toBe(STRANGER);
    expect(summary.text).toContain("Danke, Ben!");
    expect(summary.text).toContain("Salsa Night");
    expect(summary.buttons.map((b) => b.title)).toEqual(["Veröffentlichen", "Ändern ✏️", "Verwerfen"]);

    await deliver(buttonReply(summary.buttons[0].id, STRANGER));

    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("Bachata Göttingen");
    expect(api.anthropicCalls).toHaveLength(1);
  });

  it("joins an existing Display name, whatever its case", async () => {
    const api = fakeApis();
    const link = await applyLink(api);

    await post(link, ...form(filled(await (await get(link)).text(), "salsa kassel ")));

    const row = await env.DB.prepare("SELECT display_name, first_name FROM organizer WHERE whatsapp_number = ?").bind(STRANGER).first();
    expect(row).toEqual({ display_name: "Salsa Kassel", first_name: "Ben" });
  });

  it("refuses the form without a Display name or the Terms checkbox", async () => {
    const api = fakeApis();
    const link = await applyLink(api);
    const fields = filled(await (await get(link)).text(), "");
    fields.delete("terms");

    const res = await post(link, ...form(fields));

    expect(res.status).toBe(422);
    expect(await env.DB.prepare("SELECT id FROM organizer WHERE whatsapp_number = ?").bind(STRANGER).first()).toBeNull();
  });

  it("works only once", async () => {
    const api = fakeApis();
    const link = await applyLink(api);
    const fields = filled(await (await get(link)).text(), "Bachata Göttingen");
    await post(link, ...form(fields));

    const again = await get(link);

    expect(await again.text()).toContain("abgelaufen");
    expect(api.sent.filter((m) => m.text.includes("Salsa Night"))).toHaveLength(1);
  });

  it("expires after 24 hours, and the held Flyer is deleted", async () => {
    const api = fakeApis();
    const link = await applyLink(api);
    await env.DB.prepare("UPDATE application SET created_at = datetime('now', '-25 hours')").run();

    const html = await (await get(link)).text();
    expect(html).toContain("Der Link ist abgelaufen");
    expect((await post(link, ...form(filled(html, "Bachata Göttingen")))).status).toBe(410);

    const { flyer_key } = (await env.DB.prepare("SELECT flyer_key FROM application").first<{ flyer_key: string }>())!;
    await runCron();
    expect(await env.DB.prepare("SELECT id FROM application").first()).toBeNull();
    expect(await env.FLYERS.get(flyer_key)).toBeNull();
  });

  it("keeps a resumed Flyer when the cron cleans up", async () => {
    const api = fakeApis();
    const link = await applyLink(api);
    await post(link, ...form(filled(await (await get(link)).text(), "Bachata Göttingen")));
    const { flyer_key } = (await env.DB.prepare("SELECT flyer_key FROM submission").first<{ flyer_key: string }>())!;
    await env.DB.prepare("UPDATE application SET created_at = datetime('now', '-25 hours')").run();

    await runCron();

    expect(await env.FLYERS.get(flyer_key)).not.toBeNull();
  });

  it("continues once the Flyer is read when the form was quicker than the extraction", async () => {
    const api = fakeApis();
    const link = await applyLink(api);
    const extraction = (await env.DB.prepare("SELECT extraction FROM application").first<{ extraction: string }>())!.extraction;
    await env.DB.prepare("UPDATE application SET extraction = NULL").run();

    await post(link, ...form(filled(await (await get(link)).text(), "Bachata Göttingen")));
    expect(api.texts().some((t) => t.includes("Salsa Night"))).toBe(false);

    // The extraction finishing later (as a retried "Ja" would) picks up the completed application.
    await env.DB.prepare("UPDATE application SET extraction = ?").bind(extraction).run();
    await deliver(buttonReply(button(api, "Ja, meine").id, STRANGER));

    expect(api.sent.at(-1)!.text).toContain("Salsa Night");
    expect(api.sent.filter((m) => m.text.includes("Salsa Night"))).toHaveLength(1);
  });

  it("is only thanked for on Nein, and the answer is remembered for the number's next Flyers", async () => {
    const api = fakeApis();
    await deliver(imageMessage("media1", STRANGER));

    await deliver(buttonReply(button(api, "Nein, ist ein Tipp").id, STRANGER));

    expect(api.texts().at(-1)).toContain("Danke für den Tipp");
    expect(await env.DB.prepare("SELECT id FROM application").first()).toBeNull();
    const before = api.sent.length;
    await deliver(imageMessage("media2", STRANGER));
    expect(api.sent.slice(before).map((m) => m.text)).toEqual([expect.stringContaining("Danke für den Tipp")]);
    expect(api.anthropicCalls).toHaveLength(0);
  });

  it("asks again next time when Ja wasn't followed by the form", async () => {
    const api = fakeApis();
    await applyLink(api);

    await deliver(imageMessage("media2", STRANGER));

    expect(api.sent.at(-1)!.text).toContain("Ist das deine Veranstaltung?");
  });

  it("from a removed Organizer's number only gets told they can't post any more", async () => {
    await env.DB.prepare("UPDATE organizer SET blocked_at = datetime('now')").run();
    const api = fakeApis();

    await deliver(imageMessage("media1"));
    await deliver(textMessage("Hallo"));

    expect(api.texts().filter((t) => !t.includes("KI"))).toEqual([
      "Du kannst hier keine Events mehr eintragen.",
      "Du kannst hier keine Events mehr eintragen.",
    ]);
    expect(api.anthropicCalls).toHaveLength(0);
  });

  it("answers an unknown apply link with 404", async () => {
    expect((await get("http://dancecalendar.test/a/nope")).status).toBe(404);
  });
});

describe("an Organizer's Flyer that isn't an event", () => {
  it("still says so after applying", async () => {
    const api = fakeApis({ extraction: { ...flyer([]), is_event_flyer: false } });
    const link = await applyLink(api);

    await post(link, ...form(filled(await (await get(link)).text(), "Bachata Göttingen")));

    expect(api.texts().at(-1)).toContain("keine Tanzveranstaltung");
  });
});
