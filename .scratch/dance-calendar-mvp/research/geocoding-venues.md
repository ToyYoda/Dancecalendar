# Geocoding and distance for Venues

Research for ticket `issues/04-geocoding-venues.md`. Sources read 2026-10-31.

## Question

How do Venues get coordinates, how is the "center + radius km" filter computed, how does a Dancer share "my location", and is a free map display feasible, all at zero or near-zero cost?

## Recommendation

1. **Geocode once per Venue, server-side, then store lat/lon on the Venue.** Venues are shared across Events (GLOSSARY), so geocoding happens only when a new Venue is created. That is a handful of lookups per week, well inside every free policy.
2. **Use Photon (photon.komoot.io) as the primary geocoder, with Nominatim (nominatim.openstreetmap.org) as the fallback.** Bias Photon to the region with `lat=51.4&lon=9.7` (or a `bbox`). Call both from the backend with an identifying User-Agent, cache every result, and put the endpoint behind a config switch.
3. **Keep a human in the loop.** The Organizer confirmation step (or the Admin, for Tips) shows the matched Venue name and address, ideally on a small map, and can correct it. After that the Venue is reused, so the AI-extracted Venue text should first be matched against existing Venues before any geocoder call.
4. **Use straight-line (haversine) distance for the radius filter.** It is computed in SQL or JS against stored coordinates and needs no external service.
5. **"My location":** use `navigator.geolocation.getCurrentPosition` (HTTPS only, behind a permission prompt) with low accuracy. Offer a city picker (Kassel, Göttingen, or any typed town, geocoded through the backend) as the default and fallback. Store the center in the URL rounded to about 2 decimals (around 1 km), which also avoids leaking a precise home location through shared links.
6. **A map is feasible for free.** Use OpenFreeMap vector tiles with MapLibre GL JS (no key, no stated view limits, attribution required). Alternatively, use OSM's standard tiles with Leaflet at low volume, following the tile policy. A map is a nice-to-have, not needed for the filter.

## Findings

### Nominatim (OSMF public instance)

Source: [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

- "Absolute maximum of 1 request per second." Scripts that run periodically are limited to 4 requests per minute.
- Requests must carry an identifying User-Agent or Referer. Stock HTTP-library user agents are not accepted.
- Results must be cached on your side.
- **Autocomplete is forbidden**: you must not implement search-as-you-type on the client side using the API.
- Apps must be able to switch off use of the service when OSMF asks, without a software update. A caching proxy is recommended. Limits apply per app or site, not per user.
- Attribution must be clearly displayed. The data is "© OpenStreetMap contributors, ODbL 1.0" (returned in every response).
- No guarantee: access can be withdrawn, and the policy can change without notice.

Source: [Nominatim Search API docs](https://nominatim.org/release-docs/latest/api/Search/)

- `countrycodes=de` is a hard filter. `viewbox` biases results, and `bounded=1` turns it into a strict filter. `layer=poi|address` restricts the category. A structured `amenity=` field accepts a POI name.

### Photon (komoot public instance)

Sources: [photon.komoot.io](https://photon.komoot.io/), [komoot/photon README](https://github.com/komoot/photon), [API v1 docs](https://raw.githubusercontent.com/komoot/photon/master/docs/api-v1.md)

- The public demo may be used for projects, but "Extensive usage will be throttled or completely banned". There are no availability guarantees, and changes can come without notice. No numeric rate limit is published.
- It is built for search-as-you-type and is typo-tolerant. The software is Apache-2.0 and the data is OSM (attribution to OSM is still owed under ODbL).
- Parameters: `lat`/`lon` focus point plus `zoom` and `location_bias_scale`, `bbox` (hard restriction), `layer` (house, street, city, ...), `lang`, `limit`, and category include/exclude filters (`osm_tag` is deprecated).
- It can be self-hosted (Java plus a downloadable OSM index) if the public instance ever becomes unavailable. That costs more than "near zero", so it is only a fallback plan.

### Spot check: local venues (5 queries each, 2026-10-31, manual, identified UA)

| Query | Nominatim | Photon (biased to 51.4, 9.7) |
|---|---|---|
| Kulturfabrik Salzmann Kassel | found (club, Leipziger Str. 407) | found, same OSM node |
| Schlachthof Kassel | found, but the wrong one (a company building, not the cultural venue) | same wrong top hit |
| Musa Göttingen | **nothing** (OSM name is "Musa e. V.") | found (nightclub, Hagenweg 2a) |
| Exil Göttingen | **nothing** (OSM name "EXIL", tag nightclub) | found (Weender Landstr. 5) |
| Friedrich-Ebert-Straße 1, Kassel | **nothing** | found (house number 1) |

Takeaways: Photon handles partial or informal venue names and addresses much better. Both can still return a wrong same-named place ("Schlachthof"), so the confirm/correct step is needed. Small dance schools or bars may be missing from OSM entirely. In that case the Admin can place a pin manually, or add the venue to OSM, which benefits everyone.

### Browser "my location"

Source: [MDN Geolocation.getCurrentPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)

- It works only in secure contexts (HTTPS) and can be blocked by the `geolocation` Permissions-Policy. The user must explicitly grant permission, and a prompt appears when the method is called.
- Options are `enableHighAccuracy` (default false; true is slower and uses more power), `timeout` (default Infinity, so set something like 10 s), and `maximumAge` (default 0; a few minutes of caching is fine here).
- Errors are `GeolocationPositionError` with codes 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, and 3 TIMEOUT. `coords.accuracy` is given in meters.
- City-level precision is all the radius filter needs, so `enableHighAccuracy: false` is the right choice. A denied or failed request falls back to the city picker.

### Distance: is straight-line good enough?

- Haversine on stored coordinates is exact enough for great-circle distance at this scale. Example: Kassel centre (51.313, 9.480) to Göttingen centre (51.541, 9.916) is about 39.5 km straight-line, computed by me from these coordinates. Driving is somewhat longer via the A7, but radius choices like 10/25/50 km are coarse anyway.
- Road or transit distance would need a routing API per Dancer request, which is neither free at scale nor needed. Dancers read "within 25 km" as an approximation.
- Implementation: a bounding-box prefilter plus haversine in SQL, or simply in JS over the few hundred upcoming Events. No PostGIS is needed at MVP scale. *(Engineering judgement, not from a source.)*

### Map display (tiles)

Source: [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)

- `tile.openstreetmap.org` may be used with clearly visible attribution (not hidden), an accurate Referer (do not strip it), HTTPS only, honoured cache headers, and only tiles for the current view.
- No bulk or prefetch use and no offline "save area" features. Access is best-effort with no SLA and can be blocked without notice. Sites that seek donations or are commercial are warned that access may be withdrawn. The policy recommends other providers if you cannot comply.

Source: [OpenFreeMap](https://openfreemap.org/)

- The public instance is free, with no registration, API keys or cookies, and "no limits on the number of map views or requests". Commercial use is allowed.
- Attribution (OpenMapTiles plus OpenStreetMap) is required; MapLibre adds it automatically. There is no SLA. Styles include Positron, Bright, Liberty, and Dark. It can be self-hosted.

Conclusion: OpenFreeMap with MapLibre GL JS is the most generous free option. Leaflet with OSM standard tiles is also policy-compliant for a small community site. Either way, there is no hard dependency: the Event list and radius filter work without a map.

## Open points for later tickets

- Where the Venue-matching logic lives (fuzzy match on existing Venues before geocoding) belongs to the data-model/extraction ticket.
- The privacy page should mention that location is used only in the browser to set the filter center and is not stored server-side, beyond the rounded center in the URL.
- Attribution "© OpenStreetMap contributors" is required wherever geocoded data or tiles are shown, for example in the footer.
