import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// "Was ist DanceAhead?" at /ueber, from public/landing; the calendar stays the start page.

describe("the page about DanceAhead", () => {
  it("is linked from the calendar's header", async () => {
    const html = await (await exports.default.fetch("http://dancecalendar.test/")).text();

    expect(html).toContain('href="/ueber"');
    expect(html).toContain("Was ist DanceAhead?");
  });

  it("shows what the calendar is, with the way back to it and to @DanceAheadBot", async () => {
    const res = await exports.default.fetch("http://dancecalendar.test/ueber");

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Paartanz-Kalender für Kassel und Göttingen");
    expect(html).toContain('href="/"');
    expect(html).toContain("https://t.me/DanceAheadBot");
  });

  it("opens under the same night band as the calendar, with the ink couple in the hero", async () => {
    const html = await (await exports.default.fetch("http://dancecalendar.test/ueber")).text();

    expect(html).toContain('<header class="nav ground-inverse">');
    expect(html).toContain('<section class="hero hero--collage ground-inverse"');
    expect(html).toMatch(/<canvas class="ink" data-ink="\/ink\/couple.png"/);
    expect(html).toContain('<script src="/ink/couple.js" defer></script>');
    expect(html).not.toContain("#2c3c44"); // the slate of the old design
  });

  it("sends a link to /kalender, the calendar's address for a day, back to the start page", async () => {
    const res = await exports.default.fetch("http://dancecalendar.test/kalender?c=51.31,9.48&styles=salsa", { redirect: "manual" });

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/?c=51.31,9.48&styles=salsa");
  });
});
