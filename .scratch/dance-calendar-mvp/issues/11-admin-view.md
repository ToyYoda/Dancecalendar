# Admin view

Type: grilling
Labels: wayfinder:grilling
Status: resolved

## Question

What does the Admin view hold and how does the Admin work through it? Settle:
- the Tip review queue: approve/reject, correct the extracted Events, confirm Tip Series rules
- free-text Series rules waiting for a check
- the Organizer list: auto-approved newcomers, remove/block, what happens to a removed Organizer's Events
- Series about to run out
- finding, editing, removing and reassigning any Event (including handing a Tip Event to an Organizer)
- takedown requests for Flyers
- removing Events that aren't partner dance (no automatic check exists, see "Region boundary")
- what the daily Admin email lists and links to

Built on "Stack and hosting choice" (`/admin` behind Cloudflare Access, pages rendered on the server) and "Organizer confirmation flow" (a confirmed duplicate Tip is deleted automatically; applications are auto-approved).

## Answer

Settled with the human, 2026-10-31.

- **Tip review:** a Tip opens in the same card layout as the Organizer's web confirm page ("Organizer confirmation flow"): the Flyer, its extracted Events with yellow (check) and red (missing) fields, and the Series rule in plain words. A "shown as" name comes from the Flyer.
  - Buttons: [Freigeben] / [Ablehnen]. A rejected Tip is deleted right away.
  - Free-text Series rules from Organizers go into the same queue.
  - **The tipper gets no news afterwards**: the bot can't write first, and "Danke für den Tipp" already says the Admin will check it.
- **Organizers:** a list, newest first. **"Entfernen"** blocks the WhatsApp number and deletes the Organizer's future Events and Series; past Events go with the normal 3-month cleanup.
  - The bot answers a blocked number only with "Du kannst hier keine Events mehr eintragen".
  - There is no pause state; the Admin can unblock a number by hand, and the person can apply again.
- **Events:** a search list (title, Display name, date; upcoming first). It opens **the same edit page the Organizer's private link opens**, plus two Admin-only actions:
  - **"Organizer zuweisen"**: hand a Tip Event or a Series to an Organizer.
  - **"Flyer entfernen"**: a takedown; the Event stays, the image is deleted.
- **Partner dance:** misfit Events are removed from that same edit page; repeat offenders get "Entfernen" (see "Region boundary").
- **Series running out:** a list of Series ending within 4 weeks, each with **"12 Wochen verlängern"**, which counts as a sign of life. Otherwise the Admin contacts the Organizer personally.
- **Daily Admin email at 21:00 German time** (not 08:00 as first planned), sent only when something is pending. It lists:
  - Tips and free-text Series rules to review
  - Organizers who joined since the last email, with their first Event
  - Series ending within 7 days

  Each item links to its page in the Admin view.
- **Mobile-first:** lists and cards, nothing wider than a phone.
