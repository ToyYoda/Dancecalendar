# Immediate reply when a Flyer arrives

Type: task
Labels: wayfinder:task
Status: resolved

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

## Answer

Done 2026-11-01 (commit 1bff5f0), deployed.

- `acknowledgeFlyer` in `src/whatsapp/bot.ts` sends „Danke! Ich lese deinen Flyer – in ein paar Sekunden melde ich mich.“ before the download and the AI read, for an Organizer's Flyer, a remembered Tip number's Flyer, and the „Nein, ist ein Tipp“ tap (which also reads the Flyer).
- Unknown senders don't get it on the image: their first reply is still „Ist das deine Veranstaltung?“, at once.
- The queue passes `message.attempts` to `handleMessage`; the reply goes out on the first attempt only, so a failed read that the queue retries doesn't repeat it.
- Tests: the reply comes before the summary; a failing read is still acknowledged, once across two attempts; the Tip paths show the reply before the thanks.

Not checked with a real phone yet: forward a Flyer and the reply should arrive within about a second.

## Comments

- 2026-11-02, from the Admin: the reply still came late, after a noticeable gap. Cause: it was the first thing the queue job did, so the queue's own delivery delay came before it. Moved to the webhook (commit 5ec2448): `replyReading` in `src/whatsapp/webhook.ts` sends it right after the duplicate check and before the Flyer is queued, to the same senders (an Organizer, a remembered Tip number, a „Nein, ist ein Tipp“ tap; not blocked, not after STOP). Meta's duplicate deliveries are already filtered there, so the queue-attempt guard is gone. A failed reply is logged and the Flyer is still queued. What remains is Meta's delivery to the webhook plus one Graph API call.
