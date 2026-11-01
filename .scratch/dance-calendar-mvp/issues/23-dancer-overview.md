# Full Dancer overview

Type: task
Blocked by: 16
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
