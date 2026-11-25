import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// "Was ist Taktvoll?" at /ueber, from public/landing; the calendar stays the start page.

describe("the page about Taktvoll", () => {
  it("is linked from the calendar's header", async () => {
    const html = await (await exports.default.fetch("http://dancecalendar.test/")).text();

    expect(html).toContain('href="/ueber"');
    expect(html).toContain("Was ist Taktvoll?");
  });

  it("shows what the calendar is, with the way back to it and to @DanceCalBot", async () => {
    const res = await exports.default.fetch("http://dancecalendar.test/ueber");

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Paartanz-Kalender für Kassel und Göttingen");
    expect(html).toContain('href="/"');
    expect(html).toContain("https://t.me/DanceCalBot");
  });

  it("sends a link to /kalender, the calendar's address for a day, back to the start page", async () => {
    const res = await exports.default.fetch("http://dancecalendar.test/kalender?c=51.31,9.48&styles=salsa", { redirect: "manual" });

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/?c=51.31,9.48&styles=salsa");
  });
});
