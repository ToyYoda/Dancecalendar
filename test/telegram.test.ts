import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webhookSecret } from "../src/telegram/api";
import { fakeApis, knownVenue } from "./fake-apis";
import { feed, runJob } from "./flow";

// The same bot behind Telegram's Bot API: updates come in at /telegram and become the queue's
// messages with "tg:<chat id>" addresses; replies go out through sendMessage.

const CHAT = 4242;
const ADDRESS = `tg:${CHAT}`;
let updateId = 0;

const chat = { id: CHAT, type: "private", first_name: "Ana" };
const text = (t: string) => ({ update_id: ++updateId, message: { message_id: updateId, date: Math.floor(Date.now() / 1000), chat, from: chat, text: t } });
const photo = () => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat,
    from: chat,
    photo: [
      { file_id: "small", width: 90, height: 120 },
      { file_id: "large", width: 900, height: 1200 },
    ],
  },
});
const tap = (data: string) => ({ update_id: ++updateId, callback_query: { id: `cq${updateId}`, from: chat, message: { message_id: 1, chat }, data } });

// Posts an update as Telegram would and runs what it queued through the queue consumer.
async function send(update: object, secret?: string) {
  const res = await exports.default.fetch(
    new Request("http://dancecalendar.test/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret ?? (await webhookSecret(env)) },
      body: JSON.stringify(update),
    }),
  );
  const queued = vi.mocked(env.JOBS.send).mock.calls.splice(0);
  for (const [job] of queued) expect((await runJob(job as any)).retryMessages).toEqual([]);
  return { status: res.status, queued: queued.map(([job]) => job as any) };
}

beforeEach(async () => {
  await env.DB.batch(
    ["event", "submission", "venue", "admin_request", "contact", "organizer", "inbound_message"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await knownVenue(env.DB).run();
  vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
});
afterEach(() => vi.restoreAllMocks());

describe("the Telegram webhook", () => {
  it("refuses an update without Telegram's secret", async () => {
    fakeApis();

    const { status, queued } = await send(text("Hallo"), "wrong");

    expect(status).toBe(403);
    expect(queued).toEqual([]);
  });

  it("queues an update once, even when Telegram sends it again", async () => {
    fakeApis();
    const update = text("Hallo");

    const first = await send(update);
    const again = await send(update);

    expect(first.queued).toEqual([expect.objectContaining({ from: ADDRESS, type: "text", text: { body: "Hallo" } })]);
    expect(again.queued).toEqual([]);
  });

  it("ignores group chats", async () => {
    fakeApis();

    const { queued } = await send({ update_id: ++updateId, message: { message_id: 1, date: 0, chat: { id: -5, type: "group" }, text: "Hi" } });

    expect(queued).toEqual([]);
  });

  it("greets on /start with the human route and answers /admin", async () => {
    const api = fakeApis();

    await send(text("/start"));
    await send(text("/admin"));

    expect(api.sent.map((m) => m.to)).toEqual([ADDRESS, ADDRESS]);
    expect(api.sent[0].text).toContain("Mensch erreichen");
    expect(api.sent[1].text).toContain("Bescheid");
    expect(await env.DB.prepare("SELECT whatsapp_number FROM admin_request").first()).toEqual({ whatsapp_number: ADDRESS });
  });
});

describe("an Organizer on Telegram", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (1, ?, 'Ana Alves')").bind(ADDRESS),
      env.DB.prepare("INSERT INTO contact (whatsapp_number, greeted_at) VALUES (?, datetime('now'))").bind(ADDRESS),
    ]);
  });

  it("sends a Flyer photo, taps Veröffentlichen and the Event is online", async () => {
    const api = fakeApis();

    await send(photo());

    expect(api.telegramCalls).toContainEqual({ method: "getFile", body: { file_id: "large" } });
    expect(api.sent[0]).toMatchObject({ to: ADDRESS, text: expect.stringContaining("Ich lese deinen Flyer") });
    const summary = api.sent.at(-1)!;
    expect(summary.text).toContain("Salsa Night");
    const publish = summary.buttons.find((b) => b.title === "Veröffentlichen")!;

    await send(tap(publish.id));

    expect(api.telegramCalls.map((c) => c.method)).toContain("answerCallbackQuery");
    expect(api.sent.at(-1)!.text).toContain("Ist online");
    expect(await feed()).toContain("Salsa Night");
  });
});

describe("the Admin's Telegram page", () => {
  const auth = { authorization: `Basic ${btoa("admin:test-admin-secret")}` };

  it("points Telegram's webhook at the Worker with the secret and sets the commands", async () => {
    const api = fakeApis();

    const res = await exports.default.fetch(new Request("http://dancecalendar.test/admin/telegram", { method: "POST", headers: auth }));

    expect(await res.text()).toContain("@DanceCalendarTestBot");
    const hook = api.telegramCalls.find((c) => c.method === "setWebhook")!;
    expect(hook.body).toMatchObject({ url: "https://dancecalendar.test/telegram", secret_token: await webhookSecret(env) });
    expect(api.telegramCalls.find((c) => c.method === "setMyCommands")!.body.commands.map((c: any) => c.command)).toEqual(["start", "admin", "stop"]);
  });
});
