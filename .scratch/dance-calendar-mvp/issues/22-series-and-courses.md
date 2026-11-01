# Series and Courses

Type: task
Blocked by: 21
Status: resolved
Labels: wayfinder:task

## Scope

See [Event data model](06-event-data-model.md), [ADR 0001](../../../docs/adr/0001-series-end-by-themselves.md) and [Organizer confirmation flow](08-organizer-confirmation-flow.md).

- **Series:** a rule that generates Events 12 weeks ahead. A Cron Trigger extends Series daily. A Series ends by itself 12 weeks after its last sign of life (a repost or an edit).
- **Course:** a Series of Workshops with registration required.
- **Chat:**
  - Ambiguous rules get blocking question 2: "Alle 2 Wochen" / "2. Mi im Monat" / "Anders …", then the next date if the rule needs an anchor.
  - "Anders …" stores a free-text rule for the Admin to check.
  - The summary shows the rule in plain words with its next dates.
- **Links:**
  - The "Ist online!" reply sends one Series link, with single occurrences reachable from it.
  - An edit can apply to one occurrence or to the whole Series.
  - Cancelling one occurrence leaves the rest.

Since [Blocking questions in chat](21-blocking-questions.md), the questions live in `src/whatsapp/questions.ts`; the Series-rule question goes between "repost" and "time" in `nextQuestion`, with its answer stored on the held Event like the others.

## Done when

- Tests are green (Cron run with a fixed clock) and the slice is deployed.
- Demo: forward a weekly Party Flyer → confirm the rule → 12 weeks of Events show in the feed. Cancel one date. Edit the Series time → future dates change.

## Out of scope

The Admin's "12 Wochen verlängern" and the email listing for Series running out (that's [Admin tools](25-admin-tools-and-email.md)).

## Answer

Live since 2026-11-01 (f45e409). The demo passed in production: a weekly Party Flyer → "🔁 Jeden …" in the summary → published → the Series page listed 12 dates → one date cancelled ("abgesagt" in the feed) → the Series' start time changed and the dates ahead followed.

- Rules (`src/series.ts`): weekly, every N weeks, Nth or last weekday of the month, and "custom" (typed, generates nothing until the Admin checks it). Stored on `series` with the shared fields and `generated_until` (migration 0007).
- Events are generated 12 weeks ahead at publishing and by a daily cron (`30 2 * * *`), never past 12 weeks after the last sign of life. Every repost, save or cancel counts as one.
- Chat: a Series without a date asks for the next one, then an ambiguous rule is asked about ([Alle 2 Wochen] [2. Mi im Monat] [Anders …]). The summary shows the rule in plain words with its first dates. The same Series Flyer again extends the Series without a question.
- Links: one Series link (`/s/<token>`) per Series. It changes the shared fields or the rule from a new next date on, lists the dates with their own edit links, and ends the Series. Dates changed on their own keep their change. The confirm page has a "Wiederholung" select.
- Handed on: free-text rules and ending a removed Organizer's Series → "Admin tools"; Tip Series → "Tips"; showing Courses → "Full Dancer overview".

## Comments

**2026-11-01, build session:** built test-first, 109 tests green (21 new in `test/series.test.ts` and `test/series-rules.test.ts`), Series page checked locally in the browser at phone width. Not deployed yet.

- **Rules** (`src/series.ts`): weekly, every N weeks, Nth weekday of the month (or the last one), and "custom" (typed by the Organizer, generates nothing until the Admin checks it). Stored as JSON with an anchor date on `series.rule` (migration 0007). The shared fields live on `series.template`; `series.generated_until` is the last rule date that has an Event.
- **Generation:** publishing a Series inserts the Flyer's own dates, then the rule's dates after the last of them, up to 12 weeks ahead. A new daily cron (`30 2 * * *`) adds the next ones, but never beyond 12 weeks after `last_sign_of_life` (ADR 0001). Dates the cron missed stay out.
- **Chat:** a Series Flyer without a date first asks "Wann ist der nächste Termin?" (typed: "14.10.", "14.10.26"; [Event weglassen]). An ambiguous rule then asks [Alle 2 Wochen] [2. Mi im Monat] (or [Letzter Mi im Monat]) [Anders …]. "Anders …" takes a typed rule. Clear rules ("jeden Freitag", "alle 14 Tage", "jeden letzten Freitag") aren't asked about. The summary shows "🔁 Jeden Freitag: Fr 06.11., Fr 13.11., Fr 20.11. …"; a Course reads "🔁 Kurs mit Anmeldung, jeden Montag: …". Several listed dates of one Series on a Flyer form one Series, led by the first.
- **Reposts:** the same Series Flyer again (own occurrence on that date, nothing different) is taken as an update without asking. It says "🔁 verlängert deine Serie", refreshes the shared fields from that date on, and counts as a sign of life. A repost that differs is asked about as before. A one-off Flyer for a Series date changes only that date.
- **Links:** "✅ Ist online!" sends one "Serie bearbeiten" link per Series (`/s/<token>`). The Series page edits the shared fields and the rule ("Datum" = the next date; changing it or the rule restarts the Series there), lists the coming dates with their own edit links, and has "Serie beenden" (removes future dates). An occurrence's own edit page links back to its Series. Saving there marks it `detached`, so Series edits leave it alone. Cancelling it leaves the rest. Every save or cancel counts as a sign of life.
- **Confirm page:** the first Event of a Series has a "Wiederholung" select ("Nur dieser Termin" publishes a single Event). An unanswered ambiguous rule shows yellow with "Nur dieser Termin" preselected.
- **Course:** `series.registration_required` is set when the Series' Events are Workshops that need registration. The feed doesn't show it yet (handed on to "Full Dancer overview").
- Handed on: free-text rules and ending a removed Organizer's Series → "Admin tools"; Tip Series → "Tips"; showing Courses → "Full Dancer overview".

Human steps before the demo:

1. Push to `main` so CI applies migration 0007, registers the daily cron and deploys.
2. Demo: forward a weekly Party Flyer → check the "🔁 Jeden …" line in the summary → [Veröffentlichen] → open "Serie bearbeiten": 12 dates are listed. (The week feed only shows 7 days until "Full Dancer overview".) Tap one date → "Event absagen" → the feed shows it "abgesagt". Back on the Series page, change "Beginn" → [Speichern] → the dates ahead show the new time.
