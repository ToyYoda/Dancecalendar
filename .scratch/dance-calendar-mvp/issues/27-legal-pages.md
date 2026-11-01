# Legal pages

Type: task
Blocked by: 16
Labels: wayfinder:task

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

All four are linked from the footer, the application form and the bot's first reply.

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
