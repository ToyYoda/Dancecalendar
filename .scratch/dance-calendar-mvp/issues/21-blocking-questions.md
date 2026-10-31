# Blocking questions in chat, with Venue geocoding

Type: task
Blocked by: 18
Labels: wayfinder:task

## Scope

See [Organizer confirmation flow](08-organizer-confirmation-flow.md) and [Geocoding and distance for Venues](04-geocoding-venues.md).

Before the summary, the bot asks only the blocking questions, one message each with reply buttons, in this order:

1. **Reposted Flyer:** update or new?
2. *(Series rule: added by [Series and Courses](22-series-and-courses.md).)*
3. **Missing start time:** a suggested time / "Andere Uhrzeit" (typed) / "Event weglassen".
4. **Unknown Venue:** geocode it server-side once via Photon, with Nominatim as fallback. The Organizer confirms the match or types an address. The Venue is stored with its coordinates and reused afterwards.
5. **Likely duplicate** with another Organizer's Event: acknowledge the warning.

The web confirm page shows the same Venue match and lets the Organizer change it.

## Done when

- Tests are green, with Photon/Nominatim faked at the `fetch` boundary, and the slice is deployed.
- Demo: send a Flyer with no start time and a new Venue → answer both questions → the summary → publish. The Venue has coordinates.

## Out of scope

The duplicate-with-Tip question (that's [Tips](24-tips.md)).
