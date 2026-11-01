import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { berlinDate, fakeApis, flyer, knownVenue, type FlyerEvent } from "./fake-apis";
import { deliver, feed, formFrom, get, inputTag, post } from "./flow";
import { buttonReply, imageMessage, textMessage } from "./whatsapp-fixtures";
import { ORGANIZER_NUMBER } from "./whatsapp-fixtures";

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "series", "submission", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')").bind(
      ORGANIZER_NUMBER,
    ),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

type Api = ReturnType<typeof fakeApis>;
const last = (api: Api) => api.sent.at(-1)!;
const tap = (api: Api, title: string) => deliver(buttonReply(last(api).buttons.find((b) => b.title === title)!.id));
const reply = (text: string) => deliver(textMessage(text));
const form = (fields: URLSearchParams) => [fields.toString(), { "content-type": "application/x-www-form-urlencoded" }] as const;

const seriesEvent = (rule_text: string, frequency: string, more: Partial<FlyerEvent> = {}): Partial<FlyerEvent> => ({
  series: { is_series: true, rule_text, frequency, explicit_dates: [] },
  ...more,
});
const weekly = flyer([seriesEvent("jeden Freitag", "weekly")]);

const WEEKDAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function dates(): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT starts_at FROM event ORDER BY starts_at").all<{ starts_at: string }>();
  return results.map((r) => r.starts_at.slice(0, 10));
}

async function publishSeries(api: Api) {
  await deliver(imageMessage("media1"));
  await tap(api, "Veröffentlichen");
  return last(api).text.match(/https:\/\/dancecalendar\.test\/s\/\S+/)![0];
}

async function runCron(daysFromNow: number) {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now() + daysFromNow * 86_400_000, cron: "30 2 * * *" }), env, ctx);
  await waitOnExecutionContext(ctx);
}

describe("a Series Flyer with a clear rule", () => {
  it("shows the rule in plain words with its next dates, and publishes 12 weeks of Events with one Series link", async () => {
    const api = fakeApis({ extraction: weekly });
    const start = berlinDate(3);

    await deliver(imageMessage("media1"));

    const day = WEEKDAY[weekdayOf(start)];
    expect(last(api).text).toContain(`🔁 Jeden ${day}:`);
    expect(last(api).text).toContain(`${start.slice(8)}.${start.slice(5, 7)}.`);
    expect(last(api).text).not.toContain("vorerst nur dieser Termin");

    await tap(api, "Veröffentlichen");

    expect(last(api).text).toContain(`🔁 Jeden ${day}`);
    expect(last(api).text).toMatch(/Serie bearbeiten: https:\/\/dancecalendar\.test\/s\/\S+/);
    expect(last(api).text).not.toContain("/e/");
    const all = await dates();
    expect(all).toHaveLength(12); // the start in 3 days, then weekly up to 84 days from today
    expect(all.every((d) => weekdayOf(d) === weekdayOf(start))).toBe(true);
    expect(all.at(-1)! <= berlinDate(84)).toBe(true);
  });

  it("keeps the Flyer's listed dates and continues the rule after the last of them", async () => {
    const first = berlinDate(3);
    const listed = plusDays(first, 7 * 4 + 1); // off the rule, e.g. moved for a holiday
    const api = fakeApis({ extraction: flyer([seriesEvent("jeden Freitag", "weekly"), seriesEvent("jeden Freitag", "weekly", { start_date: listed })]) });

    await publishSeries(api);

    const all = await dates();
    expect(all.slice(0, 2)).toEqual([first, listed]);
    expect(all[2]).toBe(plusDays(first, 7 * 5));
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM series").first<{ n: number }>())!;
    expect(n).toBe(1);
  });

  it("becomes a Course when its Workshops need registration", async () => {
    const api = fakeApis({ extraction: flyer([seriesEvent("jeden Montag", "weekly", { type: "workshop", registration_required: true, level: "Anfänger" })]) });

    await deliver(imageMessage("media1"));
    expect(last(api).text).toContain("🔁 Kurs mit Anmeldung, jeden");
    await tap(api, "Veröffentlichen");

    const s = await env.DB.prepare("SELECT registration_required FROM series").first();
    expect(s).toEqual({ registration_required: 1 });
  });
});

describe("an ambiguous Series rule", () => {
  const ambiguous = flyer([seriesEvent("jeden 2. Mittwoch", "unclear")]);

  it("is asked about before the summary, and the answer generates the right dates", async () => {
    const api = fakeApis({ extraction: ambiguous });
    const start = berlinDate(3);
    const position = Math.ceil(Number(start.slice(8)) / 7);

    await deliver(imageMessage("media1"));

    expect(last(api).text).toContain("„jeden 2. Mittwoch“");
    expect(last(api).text).toContain("Wie ist das gemeint?");
    const titles = last(api).buttons.map((b) => b.title);
    expect(titles[0]).toBe("Alle 2 Wochen");
    expect(titles[2]).toBe("Anders …");

    await tap(api, "Alle 2 Wochen");
    expect(last(api).text).toContain(`🔁 Alle 2 Wochen ${WEEKDAY[weekdayOf(start)].toLowerCase()}s:`);
    await tap(api, "Veröffentlichen");

    const all = await dates();
    expect(all).toHaveLength(6);
    expect(all.every((d, i) => d === plusDays(start, 14 * i))).toBe(true);
    if (position <= 4) expect(titles[1]).toContain(`${position}.`);
  });

  it("takes a typed rule on Anders, which the Admin checks, and publishes only this date", async () => {
    const api = fakeApis({ extraction: ambiguous });
    await deliver(imageMessage("media1"));

    await tap(api, "Anders …");
    expect(last(api).text).toContain("Schreib mir");
    await reply("jeden 2. und 4. Mittwoch");

    expect(last(api).text).toContain("🔁 „jeden 2. und 4. Mittwoch“ – prüft der Admin, vorerst nur dieser Termin");
    await tap(api, "Veröffentlichen");
    expect(await dates()).toEqual([berlinDate(3)]);
    const s = await env.DB.prepare("SELECT rule FROM series").first<{ rule: string }>();
    expect(JSON.parse(s!.rule)).toMatchObject({ freq: "custom", text: "jeden 2. und 4. Mittwoch" });
  });
});

describe("a Series Flyer without a date", () => {
  it("asks for the next date first, then for the time", async () => {
    const api = fakeApis({ extraction: flyer([seriesEvent("jeden Freitag", "weekly", { start_date: "", start_time: "" })]) });
    const next = berlinDate(5);

    await deliver(imageMessage("media1"));
    expect(last(api).text).toContain("Wann ist der nächste Termin?");
    await reply("morgen");
    expect(last(api).text).toContain("nicht verstanden");
    await reply(`${next.slice(8)}.${next.slice(5, 7)}.`);

    expect(last(api).text).toContain("Anfangszeit");
    await tap(api, "Andere Uhrzeit");
    await reply("21:00");
    expect(last(api).text).toContain(`🔁 Jeden ${WEEKDAY[weekdayOf(next)]}:`);
    await tap(api, "Veröffentlichen");
    expect((await dates())[0]).toBe(next);
  });
});

describe("the daily cron", () => {
  it("adds the next occurrence after a sign of life, and lets a Series run out without one", async () => {
    const api = fakeApis({ extraction: weekly });
    await publishSeries(api);
    const before = await dates();

    await runCron(7);
    expect(await dates()).toEqual(before); // no sign of life since: nothing past 12 weeks from publishing

    await env.DB.prepare("UPDATE series SET last_sign_of_life = ?").bind(berlinDate(7)).run();
    await runCron(7);
    expect(await dates()).toEqual([...before, plusDays(before.at(-1)!, 7)]);

    await runCron(120);
    expect((await dates()).length).toBe(before.length + 1);
  });
});

describe("a reposted Series Flyer", () => {
  it("is recognised without a question and counts as a sign of life", async () => {
    await publishSeries(fakeApis({ extraction: weekly }));
    await env.DB.prepare("UPDATE series SET last_sign_of_life = ?").bind(berlinDate(-30)).run();
    await env.DB.prepare("DELETE FROM event WHERE starts_at > ?").bind(berlinDate(54)).run(); // as if it had run out
    await env.DB.prepare("UPDATE series SET generated_until = ?").bind(berlinDate(54)).run();
    const api = fakeApis({ extraction: weekly });

    await deliver(imageMessage("media2"));

    expect(last(api).text).toContain("Ich habe 1 Event");
    expect(last(api).text).toContain("verlängert deine Serie");
    await tap(api, "Veröffentlichen");
    expect(await dates()).toHaveLength(12);
    const s = await env.DB.prepare("SELECT last_sign_of_life FROM series").first();
    expect(s).toEqual({ last_sign_of_life: berlinDate(0) });
  });
});

describe("the Series link", () => {
  it("lists the occurrences, each with its own edit link", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));

    const page = await (await get(link)).text();

    expect(page).toContain("Serie bearbeiten");
    expect(page.match(/href="\/e\/[^"]+"/g)).toHaveLength(12);
  });

  it("changes the time of every future occurrence, except one changed on its own", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));
    const page = await (await get(link)).text();
    const occurrence = page.match(/href="(\/e\/[^"]+)"/g)![1].slice(6, -1);
    const one = formFrom(await (await get(`https://dancecalendar.test${occurrence}`)).text());
    one.set("start_time.0", "19:00");
    await post(`https://dancecalendar.test${occurrence}`, ...form(one));

    const fields = formFrom(page);
    expect(fields.get("start_time.0")).toBe("21:00");
    fields.set("start_time.0", "22:00");
    const res = await post(link, ...form(fields));

    expect(await res.text()).toContain("Gespeichert");
    const { results } = await env.DB.prepare("SELECT substr(starts_at, 12) AS time FROM event ORDER BY starts_at").all<{ time: string }>();
    expect(results.map((r) => r.time)).toEqual(["22:00", "19:00", ...Array(10).fill("22:00")]);
  });

  it("changes the rule from a new next date on", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));
    const fields = formFrom(await (await get(link)).text());
    const next = berlinDate(4);
    fields.set("start_date.0", next);
    fields.set("repeat.0", "every:2");

    await post(link, ...form(fields));

    const all = await dates();
    expect(all[0]).toBe(next);
    expect(all.every((d, i) => d === plusDays(next, 14 * i))).toBe(true);
    const s = await env.DB.prepare("SELECT rule FROM series").first<{ rule: string }>();
    expect(JSON.parse(s!.rule)).toEqual({ freq: "every_n_weeks", n: 2, anchor: next });
  });

  it("cancels one occurrence and leaves the rest", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));
    const occurrence = (await (await get(link)).text()).match(/href="(\/e\/[^"]+)"/)![1];

    await post(`https://dancecalendar.test${occurrence}/cancel`, "");

    const { results } = await env.DB.prepare("SELECT cancelled FROM event ORDER BY starts_at").all<{ cancelled: number }>();
    expect(results.map((r) => r.cancelled)).toEqual([1, ...Array(11).fill(0)]);
    expect(await feed()).toContain("card cancelled");
  });

  it("is reachable from an occurrence's own edit page", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));
    const occurrence = (await (await get(link)).text()).match(/href="(\/e\/[^"]+)"/)![1];

    const page = await (await get(`https://dancecalendar.test${occurrence}`)).text();

    expect(page).toContain(`href="${link.replace("https://dancecalendar.test", "")}"`);
  });

  it("ends the Series and removes its future occurrences", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));

    const res = await post(`${link}/end`, "");

    expect(res.status).toBe(303);
    expect(await dates()).toEqual([]);
    expect(await (await get(link)).text()).toContain("Diese Serie ist beendet");
    await runCron(1);
    expect(await dates()).toEqual([]);
  });

  it("shows the rule select pre-set on the page", async () => {
    const link = await publishSeries(fakeApis({ extraction: weekly }));
    const page = await (await get(link)).text();
    expect(formFrom(page).get("repeat.0")).toBe("weekly");
    expect(inputTag(page, "start_date.0")).toContain(`value="${berlinDate(3)}"`);
  });
});

describe("the confirm page", () => {
  it("offers the rule as a select, and Nur dieser Termin publishes a single Event", async () => {
    const api = fakeApis({ extraction: weekly });
    await deliver(imageMessage("media1"));
    await tap(api, "Ändern ✏️");
    const link = last(api).text.match(/https:\/\/dancecalendar\.test\/c\/\S+/)![0];
    const fields = formFrom(await (await get(link)).text());
    expect(fields.get("repeat.0")).toBe("weekly");
    fields.set("repeat.0", "none");

    await post(link, ...form(fields));

    expect(await dates()).toEqual([berlinDate(3)]);
    expect(last(api).text).toContain("/e/");
  });
});
