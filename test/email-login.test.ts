import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webhookSecret } from "../src/telegram/api";
import { fakeApis } from "./fake-apis";
import { Browser } from "./flow";

// Logging in at /veranstalter with an email address: the Organizer asks for a link, Brevo delivers it,
// and opening it (then one tap, so mail scanners that open links log nobody in) logs the browser in.
// No passwords. ADR 0006.

const form = (fields: Record<string, string>) => [new URLSearchParams(fields), { "content-type": "application/x-www-form-urlencoded" }] as const;

async function askForLink(b: Browser, email: string) {
  return b.post("/login/email", ...form({ email }));
}

// The link in the newest mail, as a path below /veranstalter.
function linkIn(mail: { text: string }) {
  const url = mail.text.match(/https?:\/\/\S+\/veranstalter(\/login\/email\/[\w-]+)/);
  expect(url).not.toBeNull();
  return url![1];
}

async function logInByEmail(b: Browser, email: string, api: ReturnType<typeof fakeApis>) {
  await askForLink(b, email);
  const path = linkIn(api.mails.at(-1)!);
  const res = await b.post(path);
  expect(res.headers.get("location")).toBe("/veranstalter");
  return res;
}

beforeEach(async () => {
  await env.DB.batch(
    ["event", "series", "submission", "organizer", "web_session", "login_request", "web_login", "email_login"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("logging in with email", () => {
  it("offers it on the login page", async () => {
    const html = await (await new Browser().get("/")).text();

    expect(html).toContain('action="/veranstalter/login/email"');
    expect(html).toContain('type="email"');
    expect(html).toContain("Link per E-Mail");
  });

  it("sends a link from Stepdate's address and says to check the inbox", async () => {
    const api = fakeApis();

    const res = await askForLink(new Browser(), "ana@example.test");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Schau in dein Postfach");
    expect(api.mails).toHaveLength(1);
    const mail = api.mails[0];
    expect(mail).toMatchObject({ from: "anmeldung@dancecalendar.test", to: "ana@example.test", apiKey: "test-brevo-key" });
    expect(mail.subject).toContain("Stepdate");
    expect(mail.text).toContain("15 Minuten");
    expect(mail.text).toMatch(/^http:\/\/dancecalendar\.test\/veranstalter\/login\/email\/[\w-]{32,}$/m);
  });

  it("asks once more before logging in, so a mail scanner opening the link logs nobody in", async () => {
    const api = fakeApis();
    const b = new Browser();
    await askForLink(b, "ana@example.test");
    const path = linkIn(api.mails[0]);

    const page = await b.get(path);

    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("ana@example.test");
    expect(html).toContain(`action="/veranstalter${path}"`);
    expect(b.jar.has("dc_session")).toBe(false);
  });

  it("logs a new address in, signs it up and keeps it on the next login, from any browser", async () => {
    const api = fakeApis();
    const first = new Browser();
    await logInByEmail(first, "Ana@Example.test ", api);
    const signUp = await (await first.get("/")).text();
    expect(signUp).toContain("Dein Name");
    await first.post("/anmelden", ...form({ name: "Ana Alves", terms: "on" }));

    const phone = new Browser();
    await logInByEmail(phone, "ana@example.TEST", api);

    const html = await (await phone.get("/")).text();
    expect(html).toContain("Hallo Ana Alves!");
    expect(html).toContain("Angemeldet mit E-Mail (ana@example.test)");
    const rows = await env.DB.prepare("SELECT provider, subject, email FROM web_login").all();
    expect(rows.results).toEqual([{ provider: "email", subject: "ana@example.test", email: "ana@example.test" }]);
  });

  it("works once only", async () => {
    const api = fakeApis();
    const b = new Browser();
    await logInByEmail(b, "ana@example.test", api);
    const path = linkIn(api.mails[0]);

    const again = new Browser();
    expect((await again.get(path)).headers.get("location")).toBe("/veranstalter?abgelaufen");
    expect((await again.post(path)).headers.get("location")).toBe("/veranstalter?abgelaufen");
    expect(again.jar.has("dc_session")).toBe(false);
  });

  it("lasts 15 minutes", async () => {
    const api = fakeApis();
    const b = new Browser();
    await askForLink(b, "ana@example.test");
    await env.DB.prepare("UPDATE email_login SET created_at = datetime('now', '-16 minutes')").run();

    const res = await b.post(linkIn(api.mails[0]));

    expect(res.headers.get("location")).toBe("/veranstalter?abgelaufen");
    expect(b.jar.has("dc_session")).toBe(false);
  });

  it("logs in nobody with a made-up link", async () => {
    fakeApis();
    const b = new Browser();
    expect((await b.post("/login/email/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).headers.get("location")).toBe("/veranstalter?abgelaufen");
  });

  it("answers an address that isn't one with the form again", async () => {
    const api = fakeApis();

    const res = await askForLink(new Browser(), "ana at example");

    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Bitte eine gültige E-Mail-Adresse");
    expect(api.mails).toEqual([]);
  });

  it("sends at most 3 links to one address within 15 minutes, without saying so", async () => {
    const api = fakeApis();
    const b = new Browser();

    for (let i = 0; i < 4; i++) expect((await askForLink(b, "ana@example.test")).status).toBe(200);

    expect(api.mails).toHaveLength(3);
  });

  it("says so when the mail can't be sent", async () => {
    fakeApis({ brevoDown: true });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await askForLink(new Browser(), "ana@example.test");

    expect(res.status).toBe(502);
    expect(await res.text()).toContain("konnten wir gerade keine E-Mail schicken");
  });

  it("adds an address to a Telegram login, which then logs in as that Telegram chat", async () => {
    const api = fakeApis();
    await env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (1, 'tg:4242', 'Ana Alves')").run();
    const desktop = new Browser();
    await telegramLogIn(desktop);
    const dashboard = await (await desktop.get("/")).text();
    expect(dashboard).toContain("E-Mail zusätzlich verbinden");

    await logInByEmail(desktop, "ana@example.test", api);
    const phone = new Browser();
    await logInByEmail(phone, "ana@example.test", api);

    expect(await (await phone.get("/")).text()).toContain("Hallo Ana Alves!");
  });

  it("is joined into the Telegram chat when an email-only Organizer logs in with Telegram", async () => {
    const api = fakeApis();
    const b = new Browser();
    await logInByEmail(b, "ana@example.test", api);
    await b.post("/anmelden", ...form({ name: "Ana Alves", terms: "on" }));

    await telegramLogIn(b);

    const o = await env.DB.prepare("SELECT whatsapp_number FROM organizer WHERE name = 'Ana Alves'").first();
    expect(o).toEqual({ whatsapp_number: "tg:4242" });
    const login = await env.DB.prepare("SELECT address FROM web_login WHERE provider = 'email'").first();
    expect(login).toEqual({ address: "tg:4242" });
  });

  it("is cleaned up by the hourly cron a day later", async () => {
    const api = fakeApis();
    await askForLink(new Browser(), "ana@example.test");
    await askForLink(new Browser(), "ben@example.test");
    expect(api.mails).toHaveLength(2);
    await env.DB.prepare("UPDATE email_login SET created_at = datetime('now', '-25 hours') WHERE email = 'ana@example.test'").run();

    const { cleanUpLogins } = await import("../src/web-login");
    await cleanUpLogins(env);

    const left = await env.DB.prepare("SELECT email FROM email_login").all();
    expect(left.results).toEqual([{ email: "ben@example.test" }]);
  });
});

// ---- Telegram, as in portal.test.ts ----

let updateId = 5000;
const chat = { id: 4242, type: "private", first_name: "Ana" };
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
async function telegramLogIn(b: Browser) {
  const res = await b.post("/login/telegram");
  const code = new URL(res.headers.get("location")!, b.base).searchParams.get("c")!;
  await telegram({ message: { message_id: updateId, date: 0, chat, from: chat, text: `/start login-${code}` } });
  await telegram({ callback_query: { id: `cq${updateId}`, from: chat, message: { message_id: 1, chat }, data: `login:${code}` } });
  expect((await b.get(`/login/telegram?c=${code}`)).headers.get("location")).toBe("/veranstalter");
}
