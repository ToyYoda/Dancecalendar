import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webhookSecret } from "../src/telegram/api";
import { fakeApis, knownVenue } from "./fake-apis";
import { get, post } from "./flow";

// The Organizer area at /veranstalter: logging in with Telegram (the bot asks first), the overview of
// one's Events, signing up, adding a Flyer as one's own or as a Tip, and logging out.

const CHAT = 4242;
const ADDRESS = `tg:${CHAT}`;
const BASE = "http://dancecalendar.test/veranstalter";
let updateId = 1000;

const chat = { id: CHAT, type: "private", first_name: "Ana" };

async function telegram(update: object) {
  const res = await exports.default.fetch(
    new Request("http://dancecalendar.test/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": await webhookSecret(env) },
      body: JSON.stringify({ update_id: ++updateId, ...update }),
    }),
  );
  expect(res.status).toBe(200);
}
const start = (payload: string) => telegram({ message: { message_id: updateId, date: 0, chat, from: chat, text: `/start ${payload}` } });
const tap = (data: string) => telegram({ callback_query: { id: `cq${updateId}`, from: chat, message: { message_id: 1, chat }, data } });

// A browser's cookies, kept across requests like a real one would.
class Browser {
  jar = new Map<string, string>();
  get cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      if (!value || attrs.some((a) => /max-age=0\b/i.test(a.trim()))) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }
  async get(path: string) {
    return this.take(await get(`${BASE}${path}`, { cookie: this.cookie }));
  }
  async post(path: string, body: BodyInit = "", headers: Record<string, string> = {}) {
    return this.take(await post(`${BASE}${path}`, body, { cookie: this.cookie, ...headers }));
  }
}

// Starts a Telegram login; returns the code from the bot link.
async function startLogin(b: Browser) {
  const res = await b.post("/login/telegram");
  expect(res.status).toBe(303);
  return new URL(res.headers.get("location")!, BASE).searchParams.get("c")!;
}

async function logIn(b: Browser) {
  const code = await startLogin(b);
  await start(`login-${code}`);
  await tap(`login:${code}`);
  const res = await b.get(`/login/telegram?c=${code}`);
  expect(res.headers.get("location")).toBe("/veranstalter");
}

beforeEach(async () => {
  await env.DB.batch(
    ["event", "series", "submission", "venue", "organizer", "inbound_message", "web_session", "login_request", "web_login"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  await knownVenue(env.DB).run();
  vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
});
afterEach(() => vi.restoreAllMocks());

const organizer = () =>
  env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (1, ?, 'Ana Alves')").bind(ADDRESS).run();
const event = (title: string, startsAt: string, organizerId = 1) =>
  env.DB.prepare("INSERT INTO event (title, type, starts_at, venue_id, organizer_id, edit_token) VALUES (?, 'party', ?, 1, ?, ?)")
    .bind(title, startsAt, organizerId, `tok-${title.replace(/\W/g, "")}`)
    .run();

describe("the calendar's header", () => {
  it("names both ways to add an Event: the Telegram bot and the Organizer area", async () => {
    const html = await (await get("http://dancecalendar.test/")).text();

    expect(html).toContain("https://t.me/StepdateBot");
    expect(html).toContain('href="/veranstalter"');
    expect(html).not.toMatch(/KW \d/);
  });
});

describe("logging in with Telegram", () => {
  it("shows the login to a browser that isn't logged in", async () => {
    const html = await (await new Browser().get("/")).text();

    expect(html).toContain("Mit Telegram anmelden");
    expect(html).not.toContain("Mit Google anmelden"); // not set up in the tests
  });

  it("logs the browser in once the bot's question is answered with yes", async () => {
    const api = fakeApis();
    await organizer();
    await event("Salsa Night", "2099-01-10T21:00");
    const b = new Browser();

    const code = await startLogin(b);
    const waiting = await (await b.get(`/login/telegram?c=${code}`)).text();
    expect(waiting).toContain(`https://t.me/StepdateBot?start=login-${code}`);
    await start(`login-${code}`);

    const question = api.sent.at(-1)!;
    expect(question.to).toBe(ADDRESS);
    expect(question.buttons.map((x) => x.id)).toEqual([`login:${code}`, `nologin:${code}`]);
    const digits = question.text.match(/Prüfcode (\d{4})/)![1];
    expect(waiting).toContain(digits);
    expect(await (await b.get(`/login/telegram/status?c=${code}`)).json()).toEqual({ state: "wait" });

    await tap(`login:${code}`);
    expect(await (await b.get(`/login/telegram/status?c=${code}`)).json()).toEqual({ state: "ok" });
    const done = await b.get(`/login/telegram?c=${code}`);
    expect(done.headers.get("location")).toBe("/veranstalter");
    expect(b.jar.has("dc_session")).toBe(true);

    const html = await (await b.get("/")).text();
    expect(html).toContain("Hallo Ana Alves!");
    expect(html).toContain("Deine Events erscheinen als <b>Ana Alves</b>");
    expect(html).toContain("Salsa Night");
    expect(html).toContain('href="/e/tok-SalsaNight"');
  });

  it("doesn't log in another browser that got hold of the link", async () => {
    fakeApis();
    await organizer();
    const code = await startLogin(new Browser());
    await start(`login-${code}`);
    await tap(`login:${code}`);

    const other = new Browser();
    const res = await other.get(`/login/telegram?c=${code}`);

    expect(res.headers.get("location")).toBe("/veranstalter?abgelaufen");
    expect(other.jar.has("dc_session")).toBe(false);
  });

  it("logs in nobody on Nein", async () => {
    const api = fakeApis();
    const b = new Browser();
    const code = await startLogin(b);
    await start(`login-${code}`);

    await tap(`nologin:${code}`);

    expect(api.sent.at(-1)!.text).toContain("Abgebrochen");
    expect((await b.get(`/login/telegram?c=${code}`)).headers.get("location")).toBe("/veranstalter?abgelaufen");
  });

  it("tells the chat when the link is old", async () => {
    const api = fakeApis();
    const code = await startLogin(new Browser());
    await env.DB.prepare("UPDATE login_request SET created_at = datetime('now', '-11 minutes')").run();

    await start(`login-${code}`);

    expect(api.sent.at(-1)!.text).toContain("abgelaufen");
    expect(api.sent.at(-1)!.buttons).toEqual([]);
  });

  it("doesn't reach the bot's conversation", async () => {
    fakeApis();
    const code = await startLogin(new Browser());

    await start(`login-${code}`);

    expect(vi.mocked(env.JOBS.send)).not.toHaveBeenCalled();
  });
});

describe("the Organizer area", () => {
  it("shows upcoming and past Events, and Flyers waiting to be checked", async () => {
    fakeApis();
    await organizer();
    await event("Bald", "2099-02-01T20:00");
    await event("Vorbei", "2020-02-01T20:00");
    await env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (2, 'tg:7', 'Andere Person')").run();
    await event("Fremd", "2099-02-02T20:00", 2);
    await env.DB.prepare(
      "INSERT INTO submission (id, organizer_id, flyer_key, received_on, extraction, confirm_token, source) VALUES ('s1', 1, 'flyers/x.jpg', '2099-01-01', ?, 'conf1', 'whatsapp')",
    )
      .bind(JSON.stringify({ events: [{ title: "Neue Party", start_date: "2099-03-01" }] }))
      .run();
    const b = new Browser();
    await logIn(b);

    const html = await (await b.get("/")).text();

    expect(html).toContain("Wartet auf deine Prüfung");
    expect(html).toContain('href="/c/conf1"');
    expect(html).toContain("Bald");
    expect(html).toContain("Vergangene Events (1)");
    expect(html.indexOf("Bald")).toBeLessThan(html.indexOf("Vorbei"));
    expect(html).not.toContain("Fremd");
  });

  it("signs up someone the bot doesn't know yet", async () => {
    fakeApis();
    const b = new Browser();
    await logIn(b);
    const form = await (await b.get("/")).text();
    expect(form).toContain("Dein Name");
    expect(form).toContain('name="name"');
    expect(form).toContain("öffentlich bei deinen Events");
    expect(form).not.toContain('name="first_name"');

    const res = await b.post("/anmelden", new URLSearchParams({ name: " ben becker ", terms: "on" }), {
      "content-type": "application/x-www-form-urlencoded",
    });

    expect(res.status).toBe(303);
    const o = await env.DB.prepare("SELECT name FROM organizer WHERE whatsapp_number = ?").bind(ADDRESS).first();
    expect(o).toEqual({ name: "ben becker" });
  });

  it("never joins another Organizer's name, even the same one", async () => {
    fakeApis();
    await env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (2, 'tg:7', 'Ben Becker')").run();
    const b = new Browser();
    await logIn(b);
    expect(await (await b.get("/")).text()).not.toContain("Ben Becker");

    await b.post("/anmelden", new URLSearchParams({ name: "Ben Becker", terms: "on" }), { "content-type": "application/x-www-form-urlencoded" });

    const o = await env.DB.prepare("SELECT id, name FROM organizer WHERE whatsapp_number = ?").bind(ADDRESS).first<{ id: number; name: string }>();
    expect(o?.name).toBe("Ben Becker");
    expect(o?.id).not.toBe(2);
  });

  it("reads an uploaded Flyer for the Organizer, or holds it as a Tip for the Admin", async () => {
    fakeApis();
    await organizer();
    const b = new Browser();
    await logIn(b);
    const upload = (kind: string) => {
      const form = new FormData();
      form.set("flyer", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "flyer.jpg", { type: "image/jpeg" }));
      form.set("kind", kind);
      return b.post("/flyer", form);
    };

    const own = await upload("own");
    const tip = await upload("tip");

    expect(own.headers.get("location")).toMatch(/^\/veranstalter\/flyer\//);
    expect(await tip.text()).toContain("Danke für den Tipp");
    const jobs = vi.mocked(env.JOBS.send).mock.calls.map(([job]) => job as any);
    expect(jobs.map((j) => [j.source, j.organizerId])).toEqual([
      ["web", 1],
      ["tip", null],
    ]);
  });

  it("logs out", async () => {
    fakeApis();
    await organizer();
    const b = new Browser();
    await logIn(b);

    await b.post("/logout");

    expect(await (await b.get("/")).text()).toContain("Mit Telegram anmelden");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM web_session").first("n")).toBe(0);
  });
});
