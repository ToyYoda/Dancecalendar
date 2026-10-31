# Organizer application

Type: task
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
