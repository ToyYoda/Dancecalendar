# Legal pages

Type: task
Blocked by: 16
Labels: wayfinder:task
Status: resolved

## Scope

See [Legal requirements](03-legal-requirements.md) and [research/legal-requirements.md](../research/legal-requirements.md).

Replace the interim pages with the real text, in German and English:

- **Impressum** (§ 18 MStV) with a servable address.
- **Privacy policy:**
  - the Admin as controller
  - Cloudflare, Anthropic and Meta as processors
  - retention periods
  - no tracking, so no cookie banner
- **Data deletion.**
- **Terms of Use,** including the Flyer-rights grant and the partner-dance rule.
- **OSM attribution** ("© OpenStreetMap contributors", ODbL) wherever geocoded Venue data is shown; the geocoders Photon and Nominatim are used since [Blocking questions in chat](21-blocking-questions.md), and the privacy policy should name them.

All four are linked from the footer, the application form and the bot's first reply. The application form's Terms checkbox (`src/application.tsx`, since [Organizer application](20-organizer-application.md)) names the Terms of Use but doesn't link them yet.

## Done when

- The pages are deployed.
- The pre-launch checklist items that these pages cover are ticked in the research file.

## Human steps

- Decide home vs. c/o address for the Impressum.
- Review the final text. Not legal advice.
- Meta Live mode, moved here from [slice 17](17-whatsapp-happy-path.md). In the Meta app:
  - upload an app icon (512–1024 px)
  - enter the privacy and data-deletion URLs and the EU data-protection contact
  - switch the app to Live mode

  The privacy page must carry the operator's real name and contact first. Live mode is needed before any number other than the Admin's can reach the bot, so before the first invited Organizer.

## Out of scope

Accepting the DPAs and the CJEU re-check (Deploy).

## Answer

Done 2026-11-01 (commit 6dad434).

- **Pages** (`src/legal-pages.tsx`): `/impressum`, `/datenschutz`, `/nutzungsbedingungen`, `/datenloeschung`, each in English with `?lang=en` (German is binding) and a language toggle.
- **Address:** the Admin chose the home address in Kassel. Name, address and contact email are Worker secrets `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `CONTACT_EMAIL` (set with `wrangler secret put`, also in the git-ignored `.dev.vars`), so they never land in the public repo.
- **Footer** on every page: all four pages, "Event melden" (`/impressum#melden`, the report/removal contact) and "Ortsdaten © OpenStreetMap-Mitwirkende (ODbL)".
- **Application form:** the Terms checkbox links the Terms of Use and the privacy policy (new tab, so the form survives) and adds the rights warranty.
- **Bot greeting:** links the privacy policy and the Terms ("Regeln"). Not all four: four long URLs in a WhatsApp greeting are noise, and both pages link the other two in their footer.
- **Privacy policy** names Cloudflare, Anthropic, WhatsApp Ireland (processor and independent controller), Photon and Nominatim, the retention periods from `retention.ts`/`tips.tsx`/`application.tsx`, the 8-week backup rotation, the highlighted Art. 21 objection and the HBDI. To keep it true, "Admin" requests are now deleted after 90 days by the daily retention cron.
- Checklist items these pages cover are ticked in [research/legal-requirements.md](../research/legal-requirements.md).

Still for the Admin (moved to Deploy on the map): review the final text (not legal advice); Meta Live mode (app icon, privacy and data-deletion URLs, EU data-protection contact, switch to Live) before the first other Organizer.

Found on the way: "Admin" requests are stored but shown nowhere, so nobody is told; see [Admin requests reach the Admin](30-admin-requests-reach-the-admin.md).
