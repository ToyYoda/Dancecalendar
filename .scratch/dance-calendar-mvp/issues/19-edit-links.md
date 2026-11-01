# Edit links: edit, cancel, duplicate warning

Type: task
Status: claimed
Blocked by: 18
Labels: wayfinder:task

## Scope

See [Organizer confirmation flow](08-organizer-confirmation-flow.md) and the Feed-in note on the map.

- **Edit page:** each Event's private edit link (random token, no login) opens an edit page using the confirm-page cards. It can change any field and **cancel** the Event; cancelled Events stay in the feed, marked.
- **Likely duplicates:** same Venue and overlapping time. Show a warning on publish and on edit, but never block. Two Organizers' Events stay warn-only.
- **Organizer web upload:** the second feed-in path. It is reachable from an Organizer's edit page and leads into the same confirm page.

## Done when

- Tests are green and the slice is deployed.
- Demo: tap an edit link from the bot's reply → change the time → the feed shows it. Cancel → the feed shows it marked "abgesagt".
- Demo: publish an overlapping Event at the same Venue and see the warning.

## Out of scope

Series-wide edits (that's [Series and Courses](22-series-and-courses.md)) and duplicate handling with Tips (that's [Tips](24-tips.md)).

## Comments

**2026-11-01, build session:** built test-first, 59 tests green (13 new in `test/edit-page.test.ts`), checked locally in the browser at phone width. Not deployed yet.

- `/e/<token>` edit page (`src/edit-page.tsx`) uses the confirm page's card, now shared in `src/event-card.tsx`. Every field can be changed; the server checks title, date (not in the past) and start time. [Event absagen] marks the Event cancelled (the feed shows "(abgesagt)"), and [Absage zurücknehmen] takes it back. The page shows the Flyer. A removed (blocked) Organizer's links answer 404.
- Venue on edit: matched by name as on publish, so a new name moves the Event to that Venue, but changing only the address of a known Venue changes nothing. That gets fixed with the Venue match in "Blocking questions in chat".
- Likely duplicates (`src/duplicates.ts`): same Venue, overlapping time, with a missing end taken as start + 2 h. Cancelled Events, Events from the same Flyer (a Workshop before its Party) and the unknown-place Venue don't count. The warning ("… steht schon „X“ (Display name, Mi 04.11. 22:00) – doppelt?") shows in the chat summary, on the confirm page cards and on the edit page, and never blocks.
- Organizer web upload: "Flyer hochladen" on the edit page → `/e/<token>/upload` → the same queue, waiting page and confirm page as the Admin upload, published under that Organizer, with no WhatsApp message. The upload code moved from `src/admin.tsx` to `src/upload.tsx`; the queue job is now `flyer_upload` with a `source` of `admin` or `web`. Migration 0004 rebuilds `submission` so `source` allows `web`.

Human steps before the demos:

1. Push to `main` so CI applies migration 0004 and deploys.
2. Demo 1: forward a Flyer → [Veröffentlichen] → tap the edit link → change the time → the feed shows it. Then [Event absagen] → the feed shows it as "abgesagt".
3. Demo 2: forward the same Flyer again → the summary warns "doppelt?" → publishing still works.
