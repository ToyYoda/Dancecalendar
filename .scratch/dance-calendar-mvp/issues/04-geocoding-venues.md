# Geocoding and distance for Venues

Type: research
Status: resolved
Labels: wayfinder:research

## Question

How should Venues get coordinates and how should the "center + radius km" filter be computed, at zero or near-zero cost? Compare free geocoding options (e.g. Nominatim/OSM usage policy, Photon, others) for addresses and venue names in and around Kassel and Göttingen, and how to geolocate "my location" in the browser. Is straight-line distance good enough for the radius filter? Recommend an approach, including whether a map display is feasible for free (tile usage policies).

## Answer

Recommendation: geocode each Venue once, server-side, when it's created, and store lat/lon on the Venue. Use Photon (photon.komoot.io, biased to lat 51.4 / lon 9.7) as the primary geocoder and Nominatim as the fallback, cache every result, and keep the endpoint configurable. The Organizer or Admin confirms or corrects the match, and the Venue is reused after that.

- Nominatim public instance: at most 1 request/s, an identifying User-Agent, caching required, no autocomplete, attribution required. Fine for a few Venue lookups a week.
- Photon is fuzzy and built for search-as-you-type. "Fair use" applies, extensive use is throttled, and there is no SLA. In a spot check it found "Musa Göttingen", "Exil Göttingen" and an address that Nominatim missed. Both returned the wrong "Schlachthof Kassel", so the human confirm step stays.
- The radius filter uses straight-line (haversine) distance on stored coordinates. That's good enough for coarse radii (Kassel to Göttingen is about 39.5 km straight-line). There are no routing costs.
- "My location" uses `navigator.geolocation.getCurrentPosition` (HTTPS only, behind a permission prompt) with low accuracy and a timeout. A city picker is the fallback, and the center is rounded to about 1 km in the URL.
- A map is feasible for free: OpenFreeMap tiles with MapLibre GL JS (no key, no view limits, attribution required). Leaflet with OSM standard tiles also complies with the policy at low volume. The map is optional for the MVP.

Details and sources: [research/geocoding-venues.md](../research/geocoding-venues.md)
