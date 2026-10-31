# Tips

Type: task
Blocked by: 20, 21
Labels: wayfinder:task

## Scope

See [Organizer confirmation flow](08-organizer-confirmation-flow.md), [Admin view](11-admin-view.md) and [Legal requirements](03-legal-requirements.md).

- **"Nein, ist ein Tipp":** the Flyer becomes a Tip. The bot replies "Danke für den Tipp", and the answer is remembered per number for later Flyers.
- **Review queue:** Tips land in an Admin review queue, shown in the confirm-page cards with a "shown as" name taken from the Flyer.
  - [Freigeben] publishes the Events, marked "von der Community".
  - [Ablehnen] deletes the Tip at once. The tipper gets no news.
- **Duplicate with a Tip:** when an Organizer's Event is likely the same as a Tip Event, the bot asks "Ist das dasselbe?". On yes, the Tip Event is deleted automatically.
- **Retention:** a Cron Trigger deletes Tip data within 30 days.

## Done when

- Tests are green and the slice is deployed.
- Demo: an unregistered phone sends a Flyer → Nein → the Admin approves it → it shows marked in the feed. Then an Organizer posts the same Event → "Ist das dasselbe?" → Ja → only the Organizer's Event remains.

## Out of scope

The Admin-view list of everything else (that's [Admin tools](25-admin-tools-and-email.md)).
