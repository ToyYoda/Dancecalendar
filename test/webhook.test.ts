import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApis } from "./fake-apis";
import { buttonReply, imageMessage, ORGANIZER_NUMBER, signedPost, textMessage } from "./whatsapp-fixtures";

const base = "http://dancecalendar.test/webhook";

describe("webhook verification handshake", () => {
  it("echoes the challenge when the verify token matches", async () => {
    const res = await exports.default.fetch(`${base}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=4242`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("4242");
  });

  it("refuses a wrong verify token", async () => {
    const res = await exports.default.fetch(`${base}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=4242`);

    expect(res.status).toBe(403);
  });
});

describe("webhook delivery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects a delivery whose signature does not match the app secret", async () => {
    const send = vi.spyOn(env.JOBS, "send");

    const res = await exports.default.fetch(await signedPost(textMessage("Hallo"), "wrong-secret"));

    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("acknowledges a signed message and queues it once, even when Meta delivers it twice", async () => {
    const send = vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
    const payload = textMessage("Hallo");

    const first = await exports.default.fetch(await signedPost(payload));
    const again = await exports.default.fetch(await signedPost(payload));

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ from: "4915200000001", type: "text" });
  });
});

// The "reading your Flyer" reply goes out from the webhook, before the queue picks the Flyer up.
describe("the immediate reply to a Flyer", () => {
  const TIPPER = "4917600000009";
  const STRANGER = "4917600000008";
  const READING = "Ich lese deinen Flyer";

  beforeEach(async () => {
    await env.DB.batch([
      ...["organizer", "contact", "inbound_message"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
      env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')").bind(ORGANIZER_NUMBER),
      env.DB.prepare("INSERT INTO contact (whatsapp_number, greeted_at, tip_at) VALUES (?, datetime('now'), datetime('now'))").bind(TIPPER),
    ]);
    vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
  });
  afterEach(() => vi.restoreAllMocks());

  const post = async (payload: object) => expect((await exports.default.fetch(await signedPost(payload))).status).toBe(200);
  const replies = (api: ReturnType<typeof fakeApis>) => api.texts().filter((t) => t.includes(READING));

  it("goes to an Organizer during the webhook, once even when Meta delivers twice", async () => {
    const api = fakeApis();
    const payload = imageMessage("media1");

    await post(payload);
    await post(payload);

    expect(replies(api)).toHaveLength(1);
    expect(api.sent[0].to).toBe(ORGANIZER_NUMBER);
    expect(env.JOBS.send).toHaveBeenCalledTimes(1);
  });

  it("goes to a remembered Tip number and on Nein, ist ein Tipp", async () => {
    const api = fakeApis();

    await post(imageMessage("media1", TIPPER));
    await post(buttonReply("tip:abc", STRANGER));

    expect(api.sent.filter((m) => m.text.includes(READING)).map((m) => m.to)).toEqual([TIPPER, STRANGER]);
  });

  it("doesn't go to an unknown sender's Flyer, a text, a blocked Organizer or a number that sent STOP", async () => {
    const api = fakeApis();
    await env.DB.batch([
      env.DB.prepare("UPDATE organizer SET blocked_at = datetime('now')"),
      env.DB.prepare("UPDATE contact SET opted_out_at = datetime('now')"),
    ]);

    await post(imageMessage("media1", STRANGER)); // gets "Ist das deine Veranstaltung?" from the queue instead
    await post(imageMessage("media2")); // blocked
    await post(imageMessage("media3", TIPPER)); // STOP
    await post(textMessage("Hallo"));

    expect(replies(api)).toEqual([]);
    expect(env.JOBS.send).toHaveBeenCalledTimes(4);
  });

  it("still queues the Flyer when the reply can't be sent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("down", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await post(imageMessage("media1"));

    expect(env.JOBS.send).toHaveBeenCalledTimes(1);
  });
});
