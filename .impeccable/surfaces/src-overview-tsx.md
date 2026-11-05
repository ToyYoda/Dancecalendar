---
version: 1
slug: "src-overview-tsx"
primary_target: "src/overview.tsx"
related_targets: []
---

## Scope

The Dancer overview at `/` (week feed and month view), the Event details page `/events/:id` and the `/karte` picker. Visitor mode: **Operate**. Dancers on a phone, often the same day, decide where to go tonight or this week. Code-led build; the chosen sketch is `.impeccable/mocks/decision/model-pick.html`.

## Constraints

The whole Flyer is the hero of each Event, never cropped and never covered by UI. Filters stay in the URL. German first, `?lang=en`. Cancelled Events stay visible and marked. Tip Events marked "von der Community hinzugefügt". Footer legal links stay. Fonts self-hosted (no font host sees Dancers).

## Direction contract

THESIS: The week as a city magazine's "Termine" listings: a masthead, giant day numerals, entries set in a strict column with each whole Flyer in it. It refuses the dark nightclub feed with neon glow and the rounded card grid of event apps.

OWN-WORLD: White stock, ink #111, one magenta (#D6006D) that marks today, the type of each Event and the active filter. A 4px ink rule under the masthead, 1px ink rules between days, dotted hairlines between entries. Archivo 800 for the masthead, numerals and titles, Archivo 400 for text, Archivo Narrow 700 tracked caps for labels. Square corners, no shadows except open menus.

STORY: The Dancer sees today's number and its Events first, scans titles, times and places, sees each Flyer whole, taps one for details.

FIRST VIEWPORT: "Termine" masthead with "DanceCalendar · KW 45" and the language switch. Filter strip: type tabs, Ort and Stil menus, Liste/Monat. Day index row. Then the first day. On a phone (the primary device) the giant "4" with "Mittwoch / Heute" is a band pinned under the filter strip, and the entries run full width below it, because the whole Flyer is the binding hero and a numeral column would halve it. From 600px the numeral takes the left column. Each entry: title, then one run-in line of time, type and styles with Venue and km, one muted line of Organizer and notes, then the whole Flyer (beside the text at a fixed 360px measure from 960px, one entry per row).

FORM: Termine (city-magazine listings), candidate 1 of 7, chosen by the user as IMPECCABLE'S PICK over the roll. seed:124cb2f938e0ad65.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Accepted trade-offs

On a phone the first viewport shows one Event's title, time and place before its Flyer, not several: each whole Flyer follows its own listing (the binding hero), and the day index row above gives the count per day.

## Signature move

The pinned day numeral: each day's giant numeral stays pinned while its Events scroll past, like a listings page's day head (beside them from 600px, as a band above them on a phone), so the Dancer always knows which day they are reading.
