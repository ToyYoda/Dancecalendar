import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// The calendar lives at PUBLIC_URL (danceahead.de; https://dancecalendar.test in tests). Old links to the
// workers.dev address and the www. address lead there; the webhooks keep working at every address.
describe("the address", () => {
  it("sends a page on the old workers.dev address to the same page at PUBLIC_URL", async () => {
    const res = await exports.default.fetch("https://dancecalendar.dancecalendar.workers.dev/e/abc?lang=en", { redirect: "manual" });

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://dancecalendar.test/e/abc?lang=en");
  });

  it("sends www. to the bare domain", async () => {
    const res = await exports.default.fetch("https://www.dancecalendar.test/ueber", { redirect: "manual" });

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://dancecalendar.test/ueber");
  });

  it("keeps a webhook POST on the old address where it is", async () => {
    const res = await exports.default.fetch("https://dancecalendar.dancecalendar.workers.dev/telegram", { method: "POST", body: "{}", redirect: "manual" });

    expect(res.status).not.toBe(301);
  });

  it("serves the calendar at PUBLIC_URL itself", async () => {
    const res = await exports.default.fetch("https://dancecalendar.test/", { redirect: "manual" });

    expect(res.status).toBe(200);
  });
});
