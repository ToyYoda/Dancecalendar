# Map: DanceCalendar MVP

Labels: wayfinder:map

## Destination

A running MVP of the shared dance calendar for the Kassel/Göttingen scene, live at a public URL: at least 2 Organizers post via WhatsApp, the next 4 weeks of their Events are in the calendar, and the launch is announced in the community WhatsApp groups.

## Notes

- **Execution is in scope.** This map overrides wayfinder's plan-don't-do default: once decisions clear, build/deploy/launch tickets graduate onto this map.
- Domain: partner-dance community (Salsa, Bachata, West Coast Swing, Kizomba, Urban Kiz) around Kassel and Göttingen. UI in German and English; Event text shown as on the Flyer.
- Vocabulary: use `GLOSSARY.md` (Organizer, Dancer, Admin, Display name, Event, Party, Workshop, Course, Festival, Series, Venue, Flyer, Tip). Call the `domain-modeling` skill when terms move.
- Standing preferences: convenience first for both Organizers and Dancers; free for everyone; running costs near zero (a few €/month for AI extraction is fine); single maintainer (the Admin), who is the legally responsible person.
- Decisions settled while charting (2026-10-31):
  - Feed-in: Flyer forwarded to a WhatsApp bot (web upload as second path); an AI vision model extracts one or more Events per Flyer; the Organizer confirms and Events go live immediately; a private edit link per Event handles changes and cancellations (cancelled Events stay visible, marked).
  - Organizers are individuals with a Display name; join by applying, auto-approved (amended by "Organizer confirmation flow"; the Admin can remove them afterwards); identified by WhatsApp number.
  - Unregistered sender: bot asks "Is this your event?" (answer remembered per number). Yes → apply link. No → Tip → Admin review queue; Tip Events shown under the Flyer's name, marked "added by the community".
  - Likely duplicates (same Venue, overlapping time) are warned about, not blocked.
  - Dancer side: mobile-first web overview only; no Dancer accounts; filters (style, center + radius km, type Party/Workshop/Course/Festival) encoded in the URL.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Collect sample Flyers from Kassel/Göttingen](issues/05-collect-sample-flyers.md): 17 real image Flyers catalogued with ground truth; Workshops come bundled with Parties, Series wording is ambiguous, Spanish appears, and Flyers from outside the region circulate in the same groups.
- [Event data model, including Series and Course](issues/06-event-data-model.md): one Venue and one type per Event, several styles; class-before-party is an Intro class on the Party; Festival is one multi-day Event; Series are rules generating Events 12 weeks ahead and end by themselves 12 weeks after their last sign of life; Course = Series of Workshops + registration required; level is free text, never filtered.
- [Dancer overview and filters](issues/07-dancer-overview-prototype.md): Flyer feed paged by week is the default, a month calendar with a day list is the second view; place/radius + styles chip row and type tabs above both, shared in the URL; Tip Events show their Flyer (accepted risk).
- [Geocoding and distance for Venues](issues/04-geocoding-venues.md): geocode each Venue once server-side via Photon (Nominatim fallback), Organizer/Admin confirms the match; straight-line radius; browser geolocation with city-picker fallback; optional free map via OpenFreeMap + MapLibre.
- [Flyer extraction model and cost](issues/02-flyer-extraction-model.md): Claude Haiku 5.5 with structured output (~$0.002/Flyer), retry once on Sonnet 5.5 when invalid or key fields uncertain; model-flagged uncertain fields plus code checks drive the confirmation highlights. Haiku-vs-Sonnet as primary still open (see accuracy fog).
- [WhatsApp bot feasibility and cost](issues/01-whatsapp-bot-feasibility.md): official WhatsApp Cloud API directly (no BSP, no unofficial libs); €0/month at our volume since the bot only replies within the 24h window (1,000 free/month); needs a dedicated number, card on file, HTTPS webhook; no templates; max 3 buttons per message.
- [Organizer confirmation flow](issues/08-organizer-confirmation-flow.md): chat asks only blocking questions as buttons (update/new, unclear Series rule, missing time, new Venue, same as a Tip?), then one summary [Veröffentlichen][Ändern][Verwerfen]; Ändern opens a pre-filled web confirm page; edit links in the reply. Easy case = 1 tap. Organizer applications auto-approved; a confirmed duplicate Tip is deleted automatically; no "still running?" reminder, so the bot never writes first.
- [Stack and hosting choice](issues/09-stack-and-hosting.md): one TypeScript Worker (Hono, server-rendered) on Cloudflare's free plan; D1 + R2 (EU) + Queues for extraction + Cron for Series/retention/daily Admin email; `/admin` behind Cloudflare Access; weekly D1 dumps to R2; private GitHub repo auto-deploys `main`. €0 hosting. Python dropped ([ADR 0002](../../docs/adr/0002-typescript-on-cloudflare-workers.md)).
- [Legal requirements: Impressum, GDPR, WhatsApp policy](issues/03-legal-requirements.md): Impressum with a servable address (§ 18 MStV); GDPR applies with the Admin as controller (privacy policy, DPAs with host/AI/Meta, retention limits, no tracking so no cookie banner); Organizers grant Flyer rights via Terms of Use; Tip Events shown without the Flyer image (overridden: Tip Flyers are shown, takedown on request, accepted risk); bot stays single-purpose, discloses AI in its first reply, offers STOP. Pre-launch checklist in [research/legal-requirements.md](research/legal-requirements.md). Not legal advice.

## Not yet specified

- **Extraction accuracy on real Flyers**: evaluating the chosen model against the sample Flyers ([catalogue](assets/flyer-catalogue.md) is the ground truth; top up text-only posts and WCS/Urban Kiz first); how much the Organizer has to correct.
- **Build**: slicing the decisions into implementation tickets once stack, data model and flows are settled.
- **Deploy**: domain, Cloudflare account (Workers, D1/R2 in `eu`, Queues, Access, Email; accept the Customer DPA), GitHub Actions secrets, WhatsApp number provisioning, Impressum/privacy pages live. Test early: whether a private person can set up the Meta business portfolio and get the bot's display name approved; confirm the primary Business AI-policy text (only a news source so far says task-specific AI bots stay allowed). Work the legal pre-launch checklist; Admin decides home vs. c/o address for the Impressum; re-check the CJEU appeal on the EU-US Data Privacy Framework (C-703/25 P).
- **Launch**: onboarding the first Organizers in both cities and the announcement in the community groups.

## Out of scope

- iCal / calendar subscription feeds — Dancer consumption in the MVP is the web overview only.
- Weekly digest to a WhatsApp channel or group — post-MVP.
- Push notifications / installable app (PWA) — post-MVP.
- Level and price filters — level is rarely on Flyers; not needed for launch.
- Dancer accounts — filters live in the URL.
- Translation of Event text — shown as written.
- Automatic merging of duplicates — warnings only in the MVP (the one exception: an Organizer who confirms "same as this Tip" replaces the Tip Event).
- An Organization concept above individual Organizers — Display name covers it for now.
- Editing Events via WhatsApp chat — the edit link covers it.
- Invite links — redundant since Organizer applications are auto-approved ([Organizer confirmation flow](issues/08-organizer-confirmation-flow.md)).
- Proactive bot messages ("still running?" reminders, approval notices) — would need paid templates; the bot only replies.
- Organizers taking over Tip Events themselves — Admin reassigns by hand.
