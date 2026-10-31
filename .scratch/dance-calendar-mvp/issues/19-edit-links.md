# Edit links: edit, cancel, duplicate warning

Type: task
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
