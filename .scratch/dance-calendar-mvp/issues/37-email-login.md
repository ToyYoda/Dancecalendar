# Email login for Organizers

Status: ready-for-human

Requested by the Admin on 2026-11-25, once the project had its own domain: Organizers without Telegram or Google need a way into /veranstalter.

## Decisions

- A link by email, no passwords. The link works once and for 15 minutes; opening it shows „Anmelden als …? / Jetzt anmelden“, and only that POST uses it up, so mail scanners that open links log nobody in.
- The address is stored in `web_login` (provider `email`, lowercase). It logs in as the account it was first added to; a logged-in browser adds it to its account („E-Mail zusätzlich verbinden“ on the dashboard). An email-only account joins the Telegram chat on its first Telegram login, like a Google-only one.
- At most 3 links per address per 15 minutes and 250 per day; the page looks the same either way.
- Sent through Brevo (free, EU, 300 a day), chosen by the Admin over Cloudflare Workers Paid ($5/month). ADR 0006.

## What the Admin sets up before merging

1. Brevo account (free), accept its DPA, add danceahead.de as sender domain and put Brevo's DNS records (DKIM, Brevo code, DMARC) into the Cloudflare zone; verify the sender `anmeldung@danceahead.de`.
2. Create an API key (SMTP & API → API keys) and store it: `npx wrangler secret put BREVO_API_KEY`.
3. `EMAIL_FROM` (`anmeldung@danceahead.de`) and `ADMIN_EMAIL` as Worker secrets or vars.
4. Merge; the migration 0011 runs with the deploy. Try it at /veranstalter and use „Tägliche E-Mail jetzt senden“ in /admin for the daily email.
