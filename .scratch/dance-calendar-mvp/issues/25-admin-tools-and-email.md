# Admin tools and the daily email

Type: task
Blocked by: 22, 24
Labels: wayfinder:task

## Scope

See [Admin view](11-admin-view.md). Everything is mobile-first.

- **Organizers:**
  - A list, newest first.
  - **"Entfernen"** blocks the number and deletes future Events and Series. Unblock by hand.
- **Events:**
  - A search list (upcoming first) that opens the Organizer's edit page.
  - Two Admin-only actions: **"Organizer zuweisen"** (for a Tip Event or a Series) and **"Flyer entfernen"** (deletes the image, keeps the Event).
- **Series ending within 4 weeks,** each with **"12 Wochen verlängern"** (counts as a sign of life).
- **Free-text Series rules** appear in the review queue next to Tips.
- **Daily email at 21:00 German time,** sent through Cloudflare Email only when something is pending. Cron runs in UTC, so the job must follow daylight-saving time. It lists:
  - Tips and free-text rules to review
  - new Organizers with their first Event, flagging "joined existing Display name …"
  - Series ending within 7 days

  Each item links to its Admin page.

Organizers can't change a known Venue's address or coordinates (Venues are matched by name and shared; see [Blocking questions in chat](21-blocking-questions.md)). The Admin needs a way to correct a Venue: name, address, and coordinates via the geocoder (`src/geocode.ts`).

## Done when

- Tests are green (with a fixed clock for both DST offsets) and the slice is deployed.
- Demo: remove a test Organizer → their future Events are gone and the bot refuses them. Extend a Series. Trigger the email job by hand → the email arrives with working links.

## Human steps

- Verify the Admin's address for Cloudflare Email.

## Out of scope

Cloudflare Access on `/admin` (Deploy).
