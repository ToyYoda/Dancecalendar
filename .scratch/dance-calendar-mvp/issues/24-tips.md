# Tips

Type: task
Blocked by: 20, 21
Status: claimed
Labels: wayfinder:task

## Scope

See [Organizer confirmation flow](08-organizer-confirmation-flow.md), [Admin view](11-admin-view.md) and [Legal requirements](03-legal-requirements.md).

- **"Nein, ist ein Tipp":** the Flyer becomes a Tip. The bot replies "Danke für den Tipp", and the answer is remembered per number for later Flyers.
- **Review queue:** Tips land in an Admin review queue, shown in the confirm-page cards with a "shown as" name taken from the Flyer.
  - [Freigeben] publishes the Events, marked "von der Community".
  - [Ablehnen] deletes the Tip at once. The tipper gets no news.
- **Duplicate with a Tip:** when an Organizer's Event is likely the same as a Tip Event, the bot asks "Ist das dasselbe?". On yes, the Tip Event is deleted automatically.
- **Retention:** a Cron Trigger deletes Tip data within 30 days.

Since [Organizer application](20-organizer-application.md), [Nein, ist ein Tipp] sets `contact.tip_at`, deletes the held Flyer and only thanks the sender (`answerOwnership` in `src/application.tsx`), and later Flyers from that number are only thanked. This ticket replaces both with the Tip flow.

The duplicate-with-Tip question belongs in the "duplicate" step of `src/whatsapp/questions.ts` (since [Blocking questions in chat](21-blocking-questions.md)); today that step only asks about other Organizers' Events.

Since [Series and Courses](22-series-and-courses.md): publishing creates a Series for any held Event with a rule (`publishEvents` in `src/publish.ts`), so an approved Tip Series needs its rule confirmed by the Admin and gets `series.organizer_id` NULL; the Series page already copes with that.

## Done when

- Tests are green and the slice is deployed.
- Demo: an unregistered phone sends a Flyer → Nein → the Admin approves it → it shows marked in the feed. Then an Organizer posts the same Event → "Ist das dasselbe?" → Ja → only the Organizer's Event remains.

## Out of scope

The Admin-view list of everything else (that's [Admin tools](25-admin-tools-and-email.md)).
