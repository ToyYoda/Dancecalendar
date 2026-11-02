# Wrong year on an old Flyer without a year

Type: task
Status: resolved
Labels: wayfinder:task

## Question

A Flyer that prints a date without a year ("Freitag 16.10.") and is forwarded after that date gets the next occurrence, a year ahead, and goes live with no warning. Sample Flyer 07, uploaded on 2026-11-01, was published for 16.10.2027. Neither check catches it: the prompt says not to flag a year the model inferred, and the code checks only flag dates more than 365 days ahead.

Make this case visible before publishing, in the chat summary and on the confirm page, without bothering Flyers that print the year (Festivals announced a year ahead are real).

## Proposed approach

- Add a `year_on_flyer` field ("" when not printed) to the extraction schema, like `weekday_on_flyer`, so the code knows the year was inferred.
- Inferred year and the date more than ~6 months after the Flyer arrived → chat: not published as is, with "Ist der Flyer vom letzten Jahr?" and [Ändern] to fix the date; confirm page: the date red until it's changed or confirmed.
- Re-run the eval on all 17 sample Flyers (schema change), then build test-first.

## Done when

- Tests are green and the change is deployed; the eval shows no Flyer that prints its year newly flagged.
- Demo: forward or upload sample Flyer 07 → the chat or page asks about the year instead of publishing 2027.

## Answer

Built as proposed, with one change: the confirm page shows the date **yellow**, not red (commit ede31f4).

- **Schema and prompt (v4):** each Event gets `year_on_flyer`, the year as printed next to the date, "" if none.
- **One check:** `lastYearsFlyer` in `src/extraction/checks.ts` fires when no year is printed and the date is more than 183 days after the Flyer arrived. It's also one of the `codeFlags`. Held Flyers read before this change count as printing no year. On the edit and Series pages a published date counts as settled.
- **Chat:** the Event isn't published as is: "fast ein Jahr entfernt – ist der Flyer vom letzten Jahr? Wird nicht eingetragen", with [Ändern] and [Verwerfen] when it's the only Event. The text and blocker were already there, but they waited for the model to flag `start_date`, which the prompt forbids for an inferred year, so they never fired.
- **Confirm page:** the date is yellow with "fast ein Jahr entfernt – stimmt das Jahr?". Not red, because red blocks publishing until the field changes. A real Event more than half a year ahead with no printed year couldn't be published at all. Fixing the date to last year's turns it red as "liegt in der Vergangenheit". Tapping Veröffentlichen after the warning counts as confirming it.
- **Eval** (`eval/extract_eval.py`, `code_flags` mirrors the check, `--received` pretends a later arrival): Sonnet 5.5 v4 on all 17 Flyers scores 25/25 Events, 70/71 fields, 0 silent errors, the same as v2/v3, at ~$0.014 per Flyer. Flyers that print their year return it (sometimes as "26"). The ones that print none are all within 183 days, so no Flyer is newly flagged. Flyer 07 "received" on 2026-11-01 (`v4-late` run) comes back as 2027-10-16 with `year_on_flyer` "" and is flagged. In the report its row reads "missed 1; +1" only because the ground truth holds the 2026 date.
- **Tests:** checks (half-year boundary, printed year), bot (no year → not published; printed year 300 days ahead → Veröffentlichen offered), confirm page (yellow with the year question). 181 green; CI deployed `main`.
- **Live demo still open for the Admin:** upload sample Flyer 07 at `/admin/upload` (or forward it to the bot). Arriving today, it should come back with the year question instead of 16.10.2027.
