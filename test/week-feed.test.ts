import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

// Berlin calendar date `days` from today, as "YYYY-MM-DD".
function berlinDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

async function addEvent(title: string, startsAt: string) {
  await env.DB.prepare(
    "INSERT INTO event (title, type, styles, starts_at, venue_id, organizer_id) VALUES (?, 'party', '[\"salsa\"]', ?, 1, 1)",
  )
    .bind(title, startsAt)
    .run();
}

describe("week feed", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM event"),
      env.DB.prepare("DELETE FROM venue"),
      env.DB.prepare("DELETE FROM organizer"),
      env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name) VALUES (1, '+4915200000001', 'Salsa Kassel')"),
      env.DB.prepare("INSERT INTO venue (id, name, address) VALUES (1, 'Kulturfabrik Salzmann', 'Sandershäuser Str. 34, Kassel')"),
    ]);
  });

  it("lists the Events of the next 7 days with their Venue and Display name", async () => {
    await addEvent("Salsa Night", `${berlinDate(1)}T21:00`);

    const res = await exports.default.fetch("http://dancecalendar.test/");

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("Kulturfabrik Salzmann");
    expect(html).toContain("Salsa Kassel");
  });

  it("leaves out past Events and Events more than 7 days ahead", async () => {
    await addEvent("Gestern Party", `${berlinDate(-1)}T21:00`);
    await addEvent("Heute Party", `${berlinDate(0)}T23:30`);
    await addEvent("Ferne Party", `${berlinDate(8)}T21:00`);

    const html = await (await exports.default.fetch("http://dancecalendar.test/")).text();

    expect(html).toContain("Heute Party");
    expect(html).not.toContain("Gestern Party");
    expect(html).not.toContain("Ferne Party");
  });
});
