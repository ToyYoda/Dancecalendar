# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Dancers**: anyone in the partner-dance community around Kassel and Göttingen (Salsa, Bachata, West Coast Swing, Kizomba, Urban Kiz). They need no account. The main situation is a phone, often on the same day, after Flyers have scrolled past in the community WhatsApp groups. The question is "what's on tonight, or this week, and is it worth going?"

**Organizers** post Events by forwarding their Flyer to a WhatsApp bot. **The Admin** is the single maintainer and reviews Tips. Both use other surfaces and are named here only as the source of the Dancer page's content.

## Product Purpose

One shared calendar for the regional partner-dance scene, so Dancers no longer have to piece the week together from Flyers scattered across WhatsApp groups. Success means a Dancer opens the page, sees what is on today and in the coming days near them and in their styles, and decides where to go in seconds.

## Positioning

The calendar is built from the Flyers the scene already makes. An AI reads each Flyer forwarded to the bot, so the Events carry the Organizer's own artwork and wording, and posting costs an Organizer one forward. No neighbouring listing site has the scene's real Flyers for every Event.

## Operating Context

- Dancers arrive from WhatsApp links or a bookmark, mostly on a phone. Desktop is second.
- Filters live in the URL and have no account: place and radius (the browser's position, or a place tapped on the `/karte` map, or "überall"), styles, and type (Party, Workshop, Course, Festival).
- The default range is today plus 7 days, then Monday to Sunday weeks. A month calendar is the second view.
- Each Event has a detail page. Cancelled Events stay visible, marked "abgesagt". Tip Events show "von der Community hinzugefügt".

## Capabilities and Constraints

- Server-rendered Hono on a Cloudflare Worker. Flyers are served from R2 with long caching. No tracking and no cookie banner.
- German UI first, English with `?lang=en`. Event text is shown as written on the Flyer, untranslated.
- Glossary terms are binding in UI copy and code: see `GLOSSARY.md` (Dancer, Organizer, Event, Party, Workshop, Course, Festival, Series, Intro class, Venue, Flyer, Tip).
- The footer carries Impressum, Datenschutz, Nutzungsbedingungen, Datenlöschung, "Event melden" and the OpenStreetMap credit.
- **Binding:** the whole Flyer image is the hero of each Event. Everything else on the Dancer page (the day rail, week paging, the Tanzkarte, the month view, the Bühne) is open to rethink.
- Out of scope: Dancer accounts, push, iCal, level and price filters, translation of Event text.

## Brand Commitments

- The name is **DanceCalendar**.
- German first, English second.
- No other visual commitment. The current dark "Nach Acht" look and the 💃 mark are not binding.

## Evidence on Hand

- 17 real sample Flyers from Kassel/Göttingen in `.scratch/dance-calendar-mvp/assets/flyers/`, with extracted Events, which seed the local database through `.scratch/dance-calendar-mvp/prototypes/design-review-seed.py`.
- No testimonials, usage numbers or press exist. Do not invent them.

## Product Principles

1. **The Flyer is the content.** Organizers' artwork carries the Event. The interface frames it and never competes with it.
2. **Tonight in one glance.** The first screen answers what is on today near me, before anything else.
3. **Convenience first, no sign-up.** Every state lives in the URL, every Event is one tap from its details.
4. **Truthful to the Flyer.** Show Event text as written, and mark cancelled and community-added Events honestly.
5. **Near zero running cost.** No feature that needs paid infrastructure or tracking.
