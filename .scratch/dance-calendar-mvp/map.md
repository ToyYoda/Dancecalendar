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
  - Organizers are individuals with a Display name; join by applying (Admin approves) or via invite link that skips approval; identified by WhatsApp number.
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
- [Legal requirements: Impressum, GDPR, WhatsApp policy](issues/03-legal-requirements.md): Impressum with a servable address (§ 18 MStV); GDPR applies with the Admin as controller (privacy policy, DPAs with host/AI/Meta, retention limits, no tracking so no cookie banner); Organizers grant Flyer rights via Terms of Use; Tip Events shown without the Flyer image (overridden: Tip Flyers are shown, takedown on request, accepted risk); bot stays single-purpose, discloses AI in its first reply, offers STOP. Pre-launch checklist in [research/legal-requirements.md](research/legal-requirements.md). Not legal advice.

## Not yet specified

- **Admin view**: review queue for Tips (including confirming Tip Series rules and answering their "still running?" reminders), Organizer approvals, editing/removing/reassigning Events. Shape depends on the stack and the confirmation flow.
- **Invite links**: how they're generated, sent and expire.
- **Extraction accuracy on real Flyers**: evaluating the chosen model against the sample Flyers ([catalogue](assets/flyer-catalogue.md) is the ground truth; top up text-only posts and WCS/Urban Kiz first); how much the Organizer has to correct.
- **Build**: slicing the decisions into implementation tickets once stack, data model and flows are settled.
- **Deploy**: domain, hosting setup, WhatsApp number provisioning, Impressum/privacy pages live. Test early: whether a private person can set up the Meta business portfolio and get the bot's display name approved; confirm the primary Business AI-policy text (only a news source so far says task-specific AI bots stay allowed). Work the legal pre-launch checklist; Admin decides home vs. c/o address for the Impressum; re-check the CJEU appeal on the EU-US Data Privacy Framework (C-703/25 P).
- **Launch**: onboarding the first Organizers in both cities and the announcement in the community groups.

## Out of scope

- iCal / calendar subscription feeds — Dancer consumption in the MVP is the web overview only.
- Weekly digest to a WhatsApp channel or group — post-MVP.
- Push notifications / installable app (PWA) — post-MVP.
- Level and price filters — level is rarely on Flyers; not needed for launch.
- Dancer accounts — filters live in the URL.
- Translation of Event text — shown as written.
- Automatic merging of duplicates — warnings only in the MVP.
- An Organization concept above individual Organizers — Display name covers it for now.
- Editing Events via WhatsApp chat — the edit link covers it.
- Organizers taking over Tip Events themselves — Admin reassigns by hand.
