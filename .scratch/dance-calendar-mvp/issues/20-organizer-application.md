# Organizer application

Type: task
Status: claimed
Blocked by: 17
Labels: wayfinder:task

## Scope

See [Organizer application form](12-organizer-application.md) and [Organizer confirmation flow](08-organizer-confirmation-flow.md).

- **Unregistered sender:**
  - The bot asks "Ist das deine Veranstaltung?" with [Ja, meine] / [Nein, ist ein Tipp].
  - "Ja" → the Flyer is held (extraction runs anyway), and the bot sends an apply link: single-use, valid 24 h, with a token tied to the sender's WhatsApp number.
  - "Nein" → the answer is remembered per number. Until [Tips](24-tips.md) lands, it just thanks the sender.
- **Form:**
  - Display name, with existing names suggested and joinable
  - first name (private)
  - one checkbox for the Terms of Use and the Flyer-rights grant
- **On submit:** the sender is an Organizer at once (auto-approved), the page says "Fertig! Zurück zu WhatsApp", and the bot immediately resumes the held Flyer with its summary.
- **Expiry:** an expired link shows "Der Link ist abgelaufen …". A held Flyer is deleted after 24 h.
- **Blocked numbers:** the bot only replies "Du kannst hier keine Events mehr eintragen".

## Done when

- Tests are green and the slice is deployed.
- Demo: from a second phone that isn't registered, send a Flyer → Ja → fill in the form → the bot continues with the summary → publish.
- Demo: an expired link shows the message.

## Out of scope

The Admin's view of new Organizers (that's [Admin tools](25-admin-tools-and-email.md)).

## Comments

**2026-11-01, build session:** built test-first, 72 tests green (14 new in `test/application.test.ts`), form checked locally in the browser at phone width. Not deployed yet.

- An unregistered sender's Flyer goes straight to R2 and a new `application` row (migration 0005), and the bot asks "Ist das deine Veranstaltung?" with [Ja, meine] / [Nein, ist ein Tipp]. No extraction runs before the answer.
- [Ja, meine] sends the apply link `/a/<token>` first, then reads the Flyer. The link is valid 24 h from the Flyer's arrival and works once. A retried "Ja" sends no second link and reads the Flyer only once.
- The form (`src/application.tsx`) asks for the Display name (existing names offered in a datalist; typing one in any case joins it in its existing spelling), the first name (required, private) and one Terms/Flyer-rights checkbox. Submitting creates the Organizer and shows "Fertig! Zurück zu WhatsApp". The bot then sends the held Flyer's normal summary, whichever finishes last of the form and the extraction, and exactly once.
- [Nein, ist ein Tipp] sets `contact.tip_at`, deletes the held Flyer and thanks the sender; later Flyers from that number are only thanked until "Tips" lands. A "Ja" without the form isn't remembered, so the next Flyer asks again.
- A removed (blocked) Organizer's number only gets "Du kannst hier keine Events mehr eintragen."
- First cron trigger: hourly (`17 * * * *`), deleting held Flyers older than 24 h unless they moved on to a submission. "Retention and backups" can hang its jobs on the same `scheduled` handler.
- The checkbox names the Terms of Use but links nowhere yet; "Legal pages" adds the page and the link.

Human steps before the demos:

1. Push to `main` so CI applies migration 0005, registers the cron and deploys.
2. While the Meta app is in Dev mode, the bot can only message numbers on the app's test-recipient list. Add the second phone under WhatsApp → API Setup → "To" (up to 5 numbers), or run the demo after Live mode ("Legal pages").
3. Demo 1: from the second phone, send a Flyer → [Ja, meine] → open the link and fill in the form → the bot continues with the summary → [Veröffentlichen] → the feed shows it under the new Display name.
4. Demo 2: send another Flyer from a third unregistered number (or delete the new Organizer first), tap [Ja, meine], then age the link with `npx wrangler d1 execute DB --remote --command "UPDATE application SET created_at = datetime('now', '-25 hours')"` and open it → "Der Link ist abgelaufen".
