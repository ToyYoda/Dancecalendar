# Distances from the Dancer's own position, or a place picked on a map

Type: task
Labels: wayfinder:task
Status: resolved

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

## Answer

Done 2026-11-01 (commit 5f0109d).

- **No place in the URL:** the page asks the browser for the position on its own (`data-autogeo`, skipped when the Permissions API already says "denied") and reloads with `c=lat,lng`, rounded to about a kilometre. Until then, or without permission, every Event shows, no km, no radius, and the hint „Für Entfernungen: Standort freigeben oder einen Ort auf der Karte wählen.“ Nothing is stored on the device; links on the page carry `c`, so only a bare visit asks.
- **Place filter:** the chip reads „Alle Orte“ or „Ab hier · 50 km“; inside: „Mein Standort“, „Auf Karte wählen“, and the radius chips only once a place is known. The city chips and the `kassel`/`goettingen` values of `c` are gone; old links show everything.
- **Map** at `/karte` (keeps the other filters): MapLibre GL 5.24 served from `public/vendor/` as Worker static assets (`assets` in `wrangler.jsonc`), OpenFreeMap's Liberty style; tap a point, then „Von hier messen“. Only this page loads anything from another site; the map shows its own OpenFreeMap/OpenMapTiles/OSM attribution.
- **Privacy policy:** section 3 now describes the automatic location request and OpenFreeMap receiving the IP when the map is opened.
- Updating MapLibre: copy `node_modules/maplibre-gl/dist/maplibre-gl.{js,css}` into `public/vendor/` again.

Checked in the browser at phone width: no position → all Events with the hint; the map loads, a tap on Göttingen opens `/?styles=salsa&c=51.45,9.89` with „Ab hier · 50 km“. The automatic location prompt on a real phone isn't checked yet.
