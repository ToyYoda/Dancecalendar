import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { get } from "./flow";

describe("robots.txt", () => {
  it("is a static asset that keeps crawlers out of the endless filter URLs and private pages", async () => {
    const res = await env.ASSETS.fetch("http://dancecalendar.test/robots.txt");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("User-agent: *");
    for (const path of ["/admin", "/veranstalter", "/c/", "/e/", "/flyers/", "/webhook", "/telegram", "/*?"]) {
      expect(text).toContain(`Disallow: ${path}\n`);
    }
  });
});

describe("the calendar for crawlers", () => {
  it("lets them index the plain calendar", async () => {
    const res = await get("http://dancecalendar.test/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  it("asks them not to index or follow a filtered calendar, whose links lead to endless further filter URLs", async () => {
    const res = await get("http://dancecalendar.test/?m=2030-07&von=2030-11-14");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
