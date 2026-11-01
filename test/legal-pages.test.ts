import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// The operator's details come from the test bindings in vitest.config.ts.
async function page(path: string) {
  const res = await exports.default.fetch(`http://dancecalendar.test${path}`);
  expect(res.status).toBe(200);
  return res.text();
}

describe("legal pages", () => {
  it("serves the Impressum with name, servable address, email and the § 18 MStV line", async () => {
    const html = await page("/impressum");

    expect(html).toContain("<h1>Impressum</h1>");
    expect(html).toContain("Erika Muster");
    expect(html).toContain("Teststraße 1");
    expect(html).toContain("34117 Kassel");
    expect(html).toContain("kontakt@dancecalendar.test");
    expect(html).toContain("§ 18 Abs. 2 MStV");
  });

  it("serves the privacy policy with controller, processors, retention, rights and the HBDI", async () => {
    const html = await page("/datenschutz");

    expect(html).toContain("Datenschutzerklärung");
    expect(html).not.toContain("Vorläufig");
    expect(html).toContain("Erika Muster");
    for (const text of ["Cloudflare", "Anthropic", "WhatsApp Ireland", "Photon", "Nominatim", "OpenFreeMap", "90 Tage", "30 Tage", "Widerspruch", "Hessische Beauftragte"]) {
      expect(html).toContain(text);
    }
  });

  it("serves the data-deletion instructions with the contact email", async () => {
    const html = await page("/datenloeschung");

    expect(html).toContain("STOP");
    expect(html).toContain("kontakt@dancecalendar.test");
  });

  it("serves the Terms of Use with the Flyer licence and the partner-dance rule", async () => {
    const html = await page("/nutzungsbedingungen");

    expect(html).toContain("<h1>Nutzungsbedingungen</h1>");
    expect(html).toContain("Rechte");
    expect(html).toContain("Paartanz");
  });

  it("serves each page in English with ?lang=en", async () => {
    for (const [path, heading] of [
      ["/impressum", "Imprint"],
      ["/datenschutz", "Privacy policy"],
      ["/datenloeschung", "Data deletion"],
      ["/nutzungsbedingungen", "Terms of Use"],
    ]) {
      const html = await page(`${path}?lang=en`);
      expect(html).toContain('<html lang="en">');
      expect(html).toContain(`<h1>${heading}</h1>`);
      expect(html).toContain(`href="${path}"`); // back to German
    }
  });

  it("links all four pages and the OpenStreetMap credit from every page's footer", async () => {
    const html = await page("/");

    for (const path of ["/impressum", "/datenschutz", "/nutzungsbedingungen", "/datenloeschung"]) expect(html).toContain(`href="${path}"`);
    expect(html).toContain("OpenStreetMap");
  });

  it("keeps the English footer in English", async () => {
    const html = await page("/datenschutz?lang=en");

    expect(html).toContain('href="/impressum?lang=en">Imprint');
    expect(html).toContain('href="/nutzungsbedingungen?lang=en">Terms');
  });
});
