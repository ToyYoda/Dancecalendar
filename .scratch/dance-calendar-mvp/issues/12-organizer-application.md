# Organizer application form

Type: grilling
Labels: wayfinder:grilling
Status: resolved

## Question

What does an unregistered sender go through after answering "Ja, meine" in the bot? Settle:
- what the auto-approved application form asks: Display name (pick an existing one or create one?), name, accepting the Terms of Use and the Flyer-rights grant
- how the link ties the form to the sender's WhatsApp number without a login
- how the bot resumes the Flyer it held once the form is submitted (still inside the 24-hour window)
- what happens if the form is submitted after the window has closed

See "Organizer confirmation flow" and "Legal requirements: Impressum, GDPR, WhatsApp policy".

## Answer

Settled with the human, 2026-10-31.

- **The form asks for:**
  - **Display name** (public; suggests existing names as you type)
  - **first name** (private, for the Admin only)
  - **one checkbox** accepting the Terms of Use and the Flyer-rights grant

  No phone number (WhatsApp provides it), no email, no password.
- **Shared Display names:** typing an existing Display name joins it (e.g. a second teacher of "Salsa Kassel"). The daily Admin email flags "joined existing Display name …"; "Entfernen" handles hijacking.
- **The link:** single-use, valid **24 hours**, carrying a random token the server ties to the sender's WhatsApp number. No login or SMS code: opening the link is enough, like the private edit links.
- **On submit:** the page says "Fertig! Zurück zu WhatsApp". The bot **immediately continues with the held Flyer** (questions, then the summary). Its extraction already ran while the form was being filled in.
- **Expired link:** the page says "Der Link ist abgelaufen – schick den Flyer einfach nochmal an den Bot". A held Flyer is deleted after 24 hours.
- **What the bot remembers per number:** "Nein, ist ein Tipp" is remembered. A "Ja" without a completed form is not, so the next Flyer from that number gets a fresh apply link. This replaces the prototype's "Deine Bewerbung liegt noch beim Admin" reply.
