# Immediate reply when a Flyer arrives

Type: task
Labels: wayfinder:task

## Question

From the Admin's review of the onboarding (2026-11-01): after an Organizer sends a Flyer, nothing comes back until the summary is ready, so it looks as if the bot didn't get it. Reply at once that the Flyer is being read and the answer follows in a few seconds, e.g. „Danke! Ich lese deinen Flyer – in ein paar Sekunden melde ich mich.“

## Scope

- Send it as soon as an image from an Organizer or a remembered Tip number arrives, before the download and the AI read (`receiveFlyer` / `receiveTip` in `src/whatsapp/bot.ts`).
- Unknown senders already get „Ist das deine Veranstaltung?“ at once; after „Ja“, the apply link says the Flyer is read meanwhile. Check whether the „Nein, ist ein Tipp“ path needs the same line.
- The queue retries failed jobs (`max_retries: 2`): send the reply only once per incoming message.
- One extra message per Flyer sits inside the 24 h window, so it stays free.

## Done when

- Test-first, tests green, deployed.
- Demo: forward a Flyer → the reply arrives within about a second, then the summary.
