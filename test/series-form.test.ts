import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/index";
import { berlinDate, fakeApis, flyer, knownVenue, type FlyerEvent } from "./fake-apis";
import { formFrom, get, inputTag, post, runJob } from "./flow";

// The confirm page of a Flyer that states a rule but prints no date, like "jeden letzten Donnerstag im Monat".

const ADMIN = { authorization: `Basic ${btoa("admin:test-admin-secret")}` };
const base = "http://dancecalendar.test/admin/upload";

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "series", "submission", "venue", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (1, '4915200000001', 'Ana Alves')"),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

// Uploads a Flyer as the Admin and returns the confirm page's link and HTML.
async function confirmPageOf(event: Partial<FlyerEvent>) {
  fakeApis({ extraction: flyer([event]) });
  const send = vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
  const body = new FormData();
  body.append("flyer", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "flyer.jpg", { type: "image/jpeg" }));
  body.append("organizer_id", "1");
  const res = await post(base, body, ADMIN);
  await runJob(send.mock.calls[0][0] as Job);
  const waiting = new URL(res.headers.get("location")!, base).href;
  const link = new URL((await get(waiting, ADMIN)).headers.get("location")!, base).href;
  return { link, html: await (await get(link)).text() };
}

const lastThursday: Partial<FlyerEvent> = {
  title: "Latin Party",
  start_date: "",
  start_time: "21:30",
  intro_class_time: "21:00",
  series: { is_series: true, rule_text: "jeden letzten Donnerstag im Monat", frequency: "nth_weekday_of_month", explicit_dates: [] },
};

const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const isLastThursday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 4 && plusDays(iso, 7).slice(5, 7) !== iso.slice(5, 7);

// The last Thursdays of the months from today on.
function lastThursdays(count: number): string[] {
  const out: string[] = [];
  for (let d = berlinDate(0); out.length < count; d = plusDays(d, 1)) if (isLastThursday(d)) out.push(d);
  return out;
}

const dotted = (iso: string) => `${iso.slice(8)}.${iso.slice(5, 7)}.`;

describe("a Series Flyer without a printed date", () => {
  it("fills in the next date the rule gives, marked to check, and pre-selects the rule", async () => {
    const { html } = await confirmPageOf(lastThursday);

    const [next] = lastThursdays(1);
    expect(inputTag(html, "start_date.0")).toContain(`value="${next}"`);
    expect(inputTag(html, "start_date.0")).toMatch(/class="[^"]*\bunc\b/);
    expect(html).toContain("aus „jeden letzten Donnerstag im Monat“ berechnet");
    expect(formFrom(html).get("repeat.0")).toBe("nth:-1");
    expect(html).toMatch(/<option value="nth:-1" selected="">Jeden letzten Donnerstag im Monat<\/option>/);
  });

  it("lists the dates the Series will get", async () => {
    const { html } = await confirmPageOf(lastThursday);

    const [first, second, third] = lastThursdays(3);
    expect(html).toContain("Nächste Termine");
    for (const d of [first, second, third]) expect(html).toContain(dotted(d));
  });

  it("publishes a Series of last Thursdays, starting at the intro class", async () => {
    const { link, html } = await confirmPageOf(lastThursday);

    const res = await post(link, formFrom(html).toString(), { "content-type": "application/x-www-form-urlencoded" });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Jeden letzten Donnerstag im Monat");
    const series = await env.DB.prepare("SELECT rule FROM series").all<{ rule: string }>();
    expect(series.results.map((s) => JSON.parse(s.rule))).toEqual([{ freq: "nth_weekday", n: -1, anchor: lastThursdays(1)[0] }]);
    const { results } = await env.DB.prepare("SELECT starts_at FROM event ORDER BY starts_at").all<{ starts_at: string }>();
    const expected = lastThursdays(5).filter((d) => d <= berlinDate(84));
    expect(results.map((r) => r.starts_at)).toEqual(expected.map((d) => `${d}T21:00`));
  });
});

describe("the confirm page's form", () => {
  it("has no intro class field, and the Event starts when the class begins", async () => {
    const { html } = await confirmPageOf({ start_time: "21:30", intro_class_time: "21:00" });

    expect(html).not.toContain('name="intro_class_time.0"');
    expect(html).not.toContain("Einsteigerkurs");
    expect(inputTag(html, "start_time.0")).toContain('value="21:00"');
  });
});
