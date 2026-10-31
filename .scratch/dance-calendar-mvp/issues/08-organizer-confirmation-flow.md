# Organizer confirmation flow

Type: prototype
Labels: wayfinder:prototype
Blocked by: 01, 02
Status: resolved

## Question

How does an Organizer go from forwarding a Flyer to published Events with the least friction? Prototype the flow: bot acknowledgement, showing the extracted Events (in-chat summary with buttons vs. a link to a web confirm page), correcting fields, duplicate warnings, confirming, receiving the private edit link; plus the unregistered-sender branch ("Is this your event?" → apply link or Tip). Constrained by what the chosen WhatsApp route allows ("WhatsApp bot feasibility and cost") and what extraction returns ("Flyer extraction model and cost").

## Comments

- From "Event data model, including Series and Course": the flow must also cover confirming a Series rule in plain words, asking for a missing date/time, matching or creating a Venue, the Series edit link alongside per-Event edit links, the "still running?" reminder 8 weeks after the last sign of life, and recognising a reposted Series Flyer ("update or new?").

## Answer

Settled with the human, 2026-10-31, by reacting to a prototype: [prototypes/organizer-confirmation-prototype.html](../prototypes/organizer-confirmation-prototype.html), variant C (`?variant=C`). Variants A (everything in chat) and B (link to a web page only) are kept in the same file as rejected alternatives. Serve with the `dancer-overview-prototype` entry in `.claude/launch.json`. Chosen for the least friction: the easy case (F10) publishes in **one tap**, with no typing and no browser.

- **Flow:** the Organizer forwards a Flyer, and the bot acknowledges what it found ("Ich habe 2 Events erkannt"). It then asks **blocking questions only**, one chat message each with reply buttons, in this order:
  1. a reposted Flyer: update or new?
  2. an ambiguous Series rule ("Alle 2 Wochen" / "2. Mi im Monat" / "Anders …"), followed by the next date if the rule needs an anchor
  3. a missing start time (a suggested time / "Andere Uhrzeit" / "Event weglassen")
  4. an unknown Venue: confirm the geocoded match, or type an address
  5. a likely duplicate (see below)

  After that comes **one summary** of all Events, with buttons [Veröffentlichen] [Ändern ✏️] [Verwerfen]. The summary uses WhatsApp text, shows the Series rule in plain words with its next dates, and marks uncertain fields with ⚠️.
- **Ändern** sends a separate link message (Cloud API: a URL button can't share a message with reply buttons). It opens a private **web confirm page**, pre-filled with the chat answers: one card per Event, yellow = check, red = missing (no start time, no Event), an "eintragen" checkbox per Event, and a Publish button that stays disabled until nothing is missing.
- **After publishing**, the bot replies "✅ Ist online!" with a private edit link per Event, and for a Series one Series link (single occurrences reachable from it). The bot only ever replies, so everything stays inside the 24-hour window.
- **Typed input** is only needed for "Andere Uhrzeit", "Anders …" (a free-text Series rule, which the Admin then checks), and a typed address.
- **Duplicates with a community Tip:** the bot asks like a repost: "Am Do 15.10. ist in „Startup Bar" schon „Latin Afterwork" (von der Community) eingetragen. Ist das dasselbe?" On yes, the Organizer's Event is published and **the Tip Event is deleted automatically**, with no Admin step. Otherwise both stay, with the warning acknowledged. Duplicates between two Organizers stay warn-only.
- **Unregistered sender:** the first reply carries the AI disclosure, the privacy link, a route to a human and STOP. Then the bot asks "Ist das deine Veranstaltung?" (remembered per number).
  - "Nein" → Tip, thanked, goes to the Admin review queue.
  - "Ja" → apply link. The application is **auto-approved**: submitting it (Display name + Terms of Use) makes the sender an Organizer at once, and the bot continues with the Flyer they already sent. The Admin can remove an Organizer afterwards. This replaces the earlier "Admin approves applications", and makes invite links redundant.
- **No "still running?" reminder.** A Series ends 12 weeks after its last sign of life (a repost or an edit). The bot never writes first, so no paid templates are needed. ADR 0001 and the data model are amended to match.
- Amendment from "Organizer application form" (2026-10-31): only the "Tipp" answer is remembered per number. "Ja, meine" without a completed form is forgotten, and the next Flyer gets a fresh apply link (valid 24 h); the held Flyer resumes right after the form is submitted.
