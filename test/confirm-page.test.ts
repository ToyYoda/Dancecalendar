import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { berlinDate, fakeApis, flyer } from "./fake-apis";
import { deliver, feed, formFrom, get, inputTag, post } from "./flow";
import { buttonReply, imageMessage, ORGANIZER_NUMBER } from "./whatsapp-fixtures";

beforeEach(async () => {
  await env.DB.batch(
    ["event", "submission", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')")
    .bind(ORGANIZER_NUMBER)
    .run();
});

afterEach(() => vi.restoreAllMocks());

// Forwards a Flyer, taps [Ändern] and returns the confirm page's link from the bot's reply.
async function openConfirmPage(api: ReturnType<typeof fakeApis>) {
  await deliver(imageMessage("media1"));
  const edit = api.sent.at(-1)!.buttons.find((b) => b.title === "Ändern ✏️")!;
  await deliver(buttonReply(edit.id));
  return api.sent.at(-1)!.text.match(/https:\/\/dancecalendar\.test\/c\/\S+/)![0];
}

const submit = (link: string, fields: URLSearchParams) =>
  post(link, fields.toString(), { "content-type": "application/x-www-form-urlencoded" });

describe("the web confirm page behind [Ändern]", () => {
  it("sends a private link that opens the page pre-filled with what was read from the Flyer", async () => {
    const api = fakeApis();

    const link = await openConfirmPage(api);

    expect(api.sent.at(-1)!.to).toBe(ORGANIZER_NUMBER);
    expect(api.sent.at(-1)!.text).toContain("privat");
    const res = await get(link);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(inputTag(html, "title.0")).toContain('value="Salsa Night"');
    expect(inputTag(html, "venue_name.0")).toContain('value="Kulturfabrik Salzmann"');
    expect(inputTag(html, "start_time.0")).toContain('value="21:00"');
  });

  it("shows the Flyer image", async () => {
    const api = fakeApis();
    const link = await openConfirmPage(api);

    const res = await get(`${link}/flyer`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("marks uncertain fields yellow and missing ones red, and keeps Publish disabled while anything is missing", async () => {
    const api = fakeApis({ extraction: flyer([{ uncertain_fields: ["venue_name"], start_time: "" }]) });
    const link = await openConfirmPage(api);

    const html = await (await get(link)).text();

    expect(inputTag(html, "venue_name.0")).toMatch(/class="[^"]*\bunc\b/);
    expect(inputTag(html, "start_time.0")).toMatch(/class="[^"]*\bmiss\b/);
    expect(inputTag(html, "title.0")).not.toMatch(/\b(unc|miss)\b/);
    expect(inputTag(html, "publish")).toContain("disabled");
  });

  it("publishes the corrected Events with the same reply and edit links as the chat", async () => {
    const api = fakeApis();
    const link = await openConfirmPage(api);
    const fields = formFrom(await (await get(link)).text());
    fields.set("title.0", "Salsa Night XXL");

    const res = await submit(link, fields);

    expect(res.status).toBe(200);
    const html = await feed();
    expect(html).toContain("Salsa Night XXL");
    const reply = api.sent.at(-1)!;
    expect(reply.to).toBe(ORGANIZER_NUMBER);
    expect(reply.text).toContain("Ist online");
    const editLink = reply.text.match(/https:\/\/dancecalendar\.test\/e\/\S+/)![0];
    expect(await res.text()).toContain(editLink);
    expect(await (await get(editLink)).text()).toContain("Salsa Night XXL");
  });

  it("won't publish while a ticked Event is missing its start time, and publishes the rest once it is unticked", async () => {
    const api = fakeApis({ extraction: flyer([{}, { title: "Weihnachtsfeier", start_date: berlinDate(4), start_time: "" }]) });
    const link = await openConfirmPage(api);
    const fields = formFrom(await (await get(link)).text());

    const refused = await submit(link, fields);

    expect(refused.status).toBe(422);
    expect(inputTag(await refused.text(), "start_time.1")).toMatch(/\bmiss\b/);
    expect(await feed()).not.toContain("Salsa Night");

    fields.delete("include");
    fields.append("include", "0");
    const res = await submit(link, fields);

    expect(res.status).toBe(200);
    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).not.toContain("Weihnachtsfeier");
    expect(api.sent.at(-1)!.text).toContain("Nicht eingetragen: Weihnachtsfeier");
  });

  it("publishes an Event once its missing start time is filled in on the page", async () => {
    const api = fakeApis({ extraction: flyer([{ start_time: "" }]) });
    const link = await openConfirmPage(api);
    const fields = formFrom(await (await get(link)).text());
    fields.set("start_time.0", "20:30");

    await submit(link, fields);

    expect(await feed()).toContain("20:30");
  });

  it("refuses a date in the past", async () => {
    const api = fakeApis();
    const link = await openConfirmPage(api);
    const fields = formFrom(await (await get(link)).text());
    fields.set("start_date.0", berlinDate(-2));

    const res = await submit(link, fields);

    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Vergangenheit");
  });

  it("publishes only once, whichever of chat and page comes first", async () => {
    const api = fakeApis();
    const link = await openConfirmPage(api);
    const fields = formFrom(await (await get(link)).text());
    const publish = api.sent.find((m) => m.buttons.some((b) => b.title === "Veröffentlichen"))!.buttons[0];

    await submit(link, fields);
    await deliver(buttonReply(publish.id));
    const again = await submit(link, fields);

    const { results } = await env.DB.prepare("SELECT id FROM event").all();
    expect(results).toHaveLength(1);
    expect(api.sent.at(-1)!.text).toContain("schon erledigt");
    expect(await again.text()).toContain("schon erledigt");
  });

  it("answers an unknown link with 404", async () => {
    expect((await get("http://dancecalendar.test/c/nope")).status).toBe(404);
  });
});
