# Dancer overview and filters

Type: prototype
Status: resolved
Labels: wayfinder:prototype
Blocked by: 06

## Question

How should the mobile-first Dancer overview look and behave? Prototype the list/calendar view and the filters (styles, center + radius, type Party/Workshop/Course/Festival) encoded in the URL, German/English switch, cancelled and "added by the community" markers, and how Series and Festivals appear in the list — using the data model from "Event data model, including Series and Course".

## Comments

- Data model settled (see its Answer): show the Intro class on Parties (the Workshop filter includes them), level as free text on Workshops/Courses, "registration required" on Courses, the Flyer image on each Event, Festivals as one multi-day entry, end times past midnight.
- From "Legal requirements": Tip Events ("added by the community") show no Flyer image, only the extracted facts.

## Answer

Settled with the human, 2026-10-31, by reacting to a prototype: [prototypes/dancer-overview-prototype.html](../prototypes/dancer-overview-prototype.html), variant D (`?variant=D`). Variants A–C are kept in the same file as the alternatives that were rejected. Serve with the `dancer-overview-prototype` entry in `.claude/launch.json` (Flyer images need the server).

- **Default view: Flyer feed.** Large cards led by the Flyer image, grouped by day, **one week at a time (Mon–Sun) with ‹ › to page**. Above the cards is a row of day buttons with Event counts; tapping one jumps to that day. The week is kept in the URL.
- **Second view: calendar.** A month grid with coloured dots per type and a bar for Festivals. Tapping a day shows that day's Events as a **compact list** (time, title, type, styles, Venue + distance, Intro class/level, Series rule, badges). The Flyer appears in the Event details.
- **No agenda list view.**
- **Filters above both views, one shared state in the URL:** a sideways-swiping row with 📍 place + radius (Kassel / Göttingen / my location; 10/25/50/100 km) and the five styles, then **type tabs** (Alle / Partys / Workshops / Kurse / Festivals, one at a time). Nothing is hidden behind a filter button.
- **Festivals** appear on every day they run ("Tag 2/3").
- **Tip Events show their Flyer image** too, marked "von der Community hinzugefügt". This is a risk the human consciously accepted, see the legal ticket's comment.
- Cancelled Events are crossed out and greyed out. Series show ↻ with their rule. Courses show "Anmeldung nötig". The Workshop tab includes Parties with an Intro class. German/English switch in the header.
