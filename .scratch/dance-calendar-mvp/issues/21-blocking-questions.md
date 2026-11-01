# Blocking questions in chat, with Venue geocoding

Type: task
Status: claimed
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

The web confirm page shows the same Venue match and lets the Organizer change it. So does the edit page: since [Edit links](19-edit-links.md) it matches Venues by name only, so changing just the address of a known Venue is ignored. The duplicate warning for question 5 already exists (`duplicatesOfExtracted` in `src/duplicates.ts`); this ticket turns it into a button.

## Done when

- Tests are green, with Photon/Nominatim faked at the `fetch` boundary, and the slice is deployed.
- Demo: send a Flyer with no start time and a new Venue → answer both questions → the summary → publish. The Venue has coordinates.

## Out of scope

The duplicate-with-Tip question (that's [Tips](24-tips.md)).

## Comments

**2026-11-01, build session:** built test-first, 87 tests green (16 new in `test/questions.test.ts`), confirm page checked locally in the browser at phone width. Not deployed yet.

- `src/whatsapp/questions.ts` asks before the summary, one message each: reposted Event → missing start time → new Venue → likely duplicate. The next question is worked out afresh from the held Events each time, so a late tap on an answered question gets "Diese Frage ist schon beantwortet." Answers live on the held Events (`answered`, `dropped`, `update_of`, `venue_guess`); a typed answer waits in `submission.awaiting` (migration 0006).
- **Repost:** the Organizer's own Event on the same day with the same title or Venue. The question shows what changed ("Beginn 20:00 statt 21:00"). [Ja, Update] replaces that Event on publish and keeps its edit link; [Nein, neues Event] adds a second one.
- **Missing start time:** [another start time from the same Flyer] [Andere Uhrzeit] [Event weglassen]. Typed times like "21:00", "20.30 Uhr" or "21" work; anything else is asked again. A missing date still goes to the confirm page.
- **New Venue** (not matched by name): `src/geocode.ts` asks Photon (biased to Kassel/Göttingen), with Nominatim as fallback. Both URLs are Worker vars, so "" switches one off, and requests carry a `DanceCalendar (<PUBLIC_URL>)` User-Agent. [Ja, genau] takes the found address and coordinates. [Nein, andere Adresse] waits for a typed address and asks again with what that finds. When nothing is found, the address can be typed in right away, or [Ohne Adresse] keeps the Venue without coordinates. The answer counts for every Event of the Flyer at that Venue, and the geocoder is asked once per wording.
- **Likely duplicate** with another Organizer's Event: [Beide behalten] / [Meins weglassen]. The chat summary no longer repeats the warning; the confirm and edit pages still show it.
- Fields answered in the chat aren't marked "bitte prüfen" any more. Left-out Events are listed as "Weggelassen: …"; if every Event is left out, the Flyer is discarded.
- Confirm page: a new Venue's card shows "📍 Neuer Ort, auf der Karte gefunden: …" (or not found). Publishing geocodes a Venue whose fields changed on the page. The edit page geocodes a newly named Venue on save. A known Venue's address still can't be changed by an Organizer; that's left to the Admin tools.
- Not done: no attribution "© OpenStreetMap contributors" is shown yet, though the research says it's owed wherever geocoded data is shown. Added to "Legal pages".

Human steps before the demo:

1. Push to `main` so CI applies migration 0006 and deploys.
2. Demo: send a Flyer with no start time and a Venue the calendar doesn't know yet (e.g. a Göttingen club) → answer the time question → confirm the Venue → the summary → [Veröffentlichen]. Then check the Venue has coordinates: `npx wrangler d1 execute DB --remote --command "SELECT name, address, lat, lng FROM venue ORDER BY id DESC LIMIT 1"`.
