# Series and Courses

Type: task
Blocked by: 21
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
