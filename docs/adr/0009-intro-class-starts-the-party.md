# The Party starts when its Intro class starts

Flyers often print an Intro class before the Party ("21 - 21:30 Uhr kostenloser Salsa Einsteigerkurs", Party "ab 21:30"). The confirm form had its own "Einsteigerkurs" field, and the extraction let a Party without a printed start begin when the class ended. Philipp found the extra field confusing and asked for it to go (2026-11-27).

Decision: an Event with an Intro class starts when the class starts. The code sets `start_time` to the Intro class's start after every extraction (`startAtIntroClass` in `src/extraction/checks.ts`), the prompt asks the model to mention the class in the description as printed, and the confirm, edit and Series forms no longer show an Intro class field. The stored Intro class time stays (Dancers still see "Einsteigerkurs 21:00", and the Workshop tab still lists Parties with one); on the edit page it moves with the start time.

The cost: a Dancer who only wants the Party sees the earlier start; the Intro class time can no longer be corrected by hand, only by sending the Flyer again.
