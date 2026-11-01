# Tips

Type: task
Blocked by: 20, 21
Status: resolved
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

## Answer

Done 2026-11-01, live on workers.dev (commit 621b28a). Code: `src/tips.tsx`, `migrations/0008_tips.sql`, tests in `test/tips.test.ts`.

- **Intake:** "Nein, ist ein Tipp" reads the held Flyer (read first, so a failed read is retried) and holds it as a `submission` with `source = 'tip'` and no Organizer. The migration rebuilds the table to allow that. The bot replies "Danke für den Tipp! 🙏 Der Admin schaut ihn sich an und trägt ihn ein." `contact.tip_at` is refreshed on every Tip, and a number with it set skips the ownership question. A picture with no dance Event gets the usual "keine Tanzveranstaltung" reply and nothing is held.
- **Review:** `/admin/tips` lists waiting Tips, oldest first. `/admin/tips/<token>` shows the confirm-page cards (shared with `/c/` through `openCards`/`readCards`) plus a "Gezeigt als" field, pre-filled from `display_name_on_flyer` and required. **Freigeben** publishes with `is_tip = 1`, `shown_as` and `organizer_id` NULL. **Ablehnen** deletes the submission and the Flyer at once. `/c/<token>` refuses Tips. The tipper gets no news either way.
- **Tip Series:** `series.organizer_id` is NULL and the new `series.shown_as` column holds the name. Occurrences generated for a Series without an Organizer are Tip Events. Once a Series is assigned to an Organizer (Admin tools), its new dates aren't.
- **Duplicate with a Tip:** a new chat question, `tip`, comes just before `duplicate`: „<Event>“: Am <date> ist in „<Venue>“ schon „<title>“ (von der Community) eingetragen. Ist das dasselbe? [Ja, dasselbe] [Nein, beide]. Ja sets `replaces_tip` on the held Event, and publishing it (from the chat or the confirm page) deletes that Tip Event. The confirm page notes "Ersetzt den Community-Tipp …". The `duplicate` question leaves out Tip Events, so Nein doesn't trigger a second warning. Only the one matching date is deleted, never a whole Tip Series.
- **Retention:** the hourly cron deletes Tips waiting unreviewed for more than 30 days, with their Flyer, and clears `tip_at` 30 days after a number's last Tip. Published Tip Events stay, since they hold no tipper data.
- `.claude/launch.json` has a `worker-admin` config (port 8788, local-only Admin password) for trying `/admin` locally.
