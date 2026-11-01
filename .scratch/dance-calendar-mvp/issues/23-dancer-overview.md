# Full Dancer overview

Type: task
Blocked by: 16
Status: claimed
Labels: wayfinder:task

## Scope

See [Dancer overview and filters](07-dancer-overview-prototype.md), [Region boundary](10-region-boundary.md) and [Geocoding](04-geocoding-venues.md). Use [prototypes/dancer-overview-prototype.html](../prototypes/dancer-overview-prototype.html) as the visual reference.

- **Views:** the Flyer feed paged by week is the default. A month calendar with a day list is the second view.
- **Filters,** all encoded in the URL and shared by both views:
  - **Place:** browser geolocation, with a city-picker fallback.
  - **Radius:** km, or "überall". The default is Kassel + Göttingen with a 50 km radius.
  - **Styles:** a chip row. Style-less Events hide once a style chip is picked.
  - **Type:** tabs for Party / Workshop / Course / Festival.
- **Distance:** straight-line, from Venue coordinates.
- **Event display:** cancelled Events are shown marked. Tip Events show their Flyer and "von der Community".
- **Flyer images:** served through the app from R2 with long cache headers.
- **Language:** the UI is in German and English. Event text is shown as written.

Since [Series and Courses](22-series-and-courses.md): occurrences are ordinary `event` rows with a `series_id`, 12 weeks ahead. A Course is a Series with `registration_required = 1`; the overview should say "Anmeldung nötig" on its Events.

## Done when

- Tests are green and the slice is deployed.
- Demo on a phone: a Göttingen-only, Bachata-only, Party-only link opens the right Events. Switch to the month view and the filters stay. Copy the URL to another phone and see the same view.

## Out of scope

The optional map (OpenFreeMap + MapLibre); post-MVP unless trivial.

## Comments

**2026-11-01, build session:** built test-first, 119 tests green (13 new in `test/overview.test.ts`; the old week-feed test is gone with `src/week-feed.tsx`), checked locally in the browser at phone width with a real sample Flyer. Not deployed yet.

- `src/overview.tsx` renders on the server, at `/`. Filters are plain links, so every view is a URL. Parameters: `c` (`kassel`, `goettingen` or `lat,lng`; none = Kassel + Göttingen), `r` (10/25/50/100/`all`, default 50), `styles`, `type` (`party`/`workshop`/`course`/`festival`, one at a time), `view=cal`, `w` (a week), `d` (the calendar's day), `lang=en`. Defaults stay out of the URL.
- **Feed:** Flyer cards (text card without a Flyer) grouped by day, a day strip with counts, ‹ › paging.
  - **Deviation from the prototype:** without `w`, the feed shows **today and the next 7 days** rather than Monday–Sunday. On a Sunday a Monday–Sunday page would show only one day. › and ‹ then page through Monday–Sunday weeks.
- **Calendar:** month grid with coloured dots per type and a bar for Festivals; the selected day as a compact list.
- **Place:** a 📍 dropdown (`<details>`) with Kassel + Göttingen / Kassel / Göttingen / Mein Standort and the radius chips incl. "überall". "Mein Standort" is the page's only script: browser geolocation, rounded to 2 decimals (about 1 km), put into `c`. Without permission the chip says "Standort nicht verfügbar"; the city chips remain.
- **Distance:** straight-line from the chosen place; by default from the nearer of Kassel and Göttingen. **Venues without coordinates show whatever the place filter**, since their distance is unknown (the Admin tools can give them coordinates).
- **Event details** at `/events/<id>` (keeps the filters for "Zurück"): Flyer, date and time, Intro class, level, Venue with address and distance, Organizer or the Tip's name from the Flyer, price, Series rule, styles, link, description.
- Badges: "Abgesagt" (card greyed, title crossed out), "von der Community hinzugefügt", "Anmeldung nötig" for Courses (`series.registration_required`). Series show "↻ Jeden Freitag". `ruleWords` gained English.
- **Flyer images** at `/flyers/<name>`, only for Flyers of published Events (held ones stay private), `cache-control: public, max-age=31536000, immutable`.
- German by default, English with `lang=en` (the EN/DE switch in the header). Event text is shown as written.

Human steps before the demo:

1. Push to `main` so CI deploys.
2. Demo on a phone: open `/?c=goettingen&r=25&styles=bachata&type=party` → only Göttingen Bachata Parties. Tap "Kalender" → the filters stay. Copy the URL to another phone → the same view. Also try "Mein Standort" (it needs the browser's permission).
