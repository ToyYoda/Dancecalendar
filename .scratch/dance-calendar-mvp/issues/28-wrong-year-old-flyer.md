# Wrong year on an old Flyer without a year

Type: task
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
