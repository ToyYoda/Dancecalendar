# Distances from the Dancer's own position, or a place picked on a map

Type: task
Labels: wayfinder:task

## Question

From the Admin's review of the Dancer overview (2026-11-01): distances should by default be measured from the Dancer's own position. Alternatively the Dancer picks a place on a map to measure from. The place chips „Kassel + Göttingen“, „Kassel“ and „Göttingen“ go.

This overrides parts of [Region boundary](10-region-boundary.md) (default Kassel + Göttingen, 50 km) and [Geocoding and distance for Venues](04-geocoding-venues.md) (city-picker fallback), and changes the place filter built in [Full Dancer overview](23-dancer-overview.md).

## Decided with the Admin

- **Without a position** (not yet asked, denied, unavailable): show all Events, with no km and no radius filter, like „überall“ today, and a short hint above the list: allow the location, or pick a place on the map.

## Scope

- On a visit without `c` in the URL, ask the browser for the position (the existing `GEO_SCRIPT`, rounded to about a kilometre) and reload with `c=lat,lng`. Remember nothing on the device; a shared link carries its own `c`. Check that a denial doesn't ask again on every page.
- Place chip row: „Mein Standort“, „Auf Karte wählen“, the radius chips; drop the city chips and the `kassel`/`goettingen` values of `c` (old links fall back to no position).
- Map picker: MapLibre GL with OpenFreeMap tiles (ticket 04). Tiles send the visitor's IP to OpenFreeMap, so the map loads only when the Dancer taps „Auf Karte wählen“; serve the MapLibre script from the Worker, not a CDN. Tap a point → `c=lat,lng`.
- Update the privacy policy (OpenFreeMap as a recipient when the map is opened) and the OSM attribution on the map itself.
- Default radius once a position is known: keep 50 km.

## Done when

- Test-first, tests green, deployed.
- Demo on a phone: open `/` → allow the location → Events show km from there; deny → all Events, no km, the hint; „Auf Karte wählen“ → tap Göttingen → the list measures from there.
