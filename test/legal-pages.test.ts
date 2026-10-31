import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// Meta's Live mode needs a privacy-policy URL and a data-deletion URL that answer.
describe("interim legal pages", () => {
  it("serves the privacy policy", async () => {
    const res = await exports.default.fetch("http://dancecalendar.test/datenschutz");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Datenschutzerklärung");
  });

  it("serves the data-deletion instructions", async () => {
    const res = await exports.default.fetch("http://dancecalendar.test/datenloeschung");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("STOP");
  });
});
