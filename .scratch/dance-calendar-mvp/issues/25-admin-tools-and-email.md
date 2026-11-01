# Admin tools and the daily email

Type: task
Blocked by: 22, 24
Status: resolved
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

Since [Series and Courses](22-series-and-courses.md): a free-text rule ("Anders …") is a Series whose `rule.freq` is `"custom"`; it generates nothing until checked. The review can set a real rule through the Series page (`/s/<series.edit_token>`, its "Wiederholung" select). "12 Wochen verlängern" is `signOfLife` in `src/series.ts`; a Series runs out at `last_sign_of_life` + 84 days. "Entfernen" must also end the Organizer's Series (`endSeries`), or the daily cron keeps generating their Events.

## Done when

- Tests are green (with a fixed clock for both DST offsets) and the slice is deployed.
- Demo: remove a test Organizer → their future Events are gone and the bot refuses them. Extend a Series. Trigger the email job by hand → the email arrives with working links.

## Human steps

- Verify the Admin's address for Cloudflare Email.

## Out of scope

Cloudflare Access on `/admin` (Deploy).

## Answer

Done 2026-11-01, deployed to workers.dev (commit 292ca25). Code: `src/admin-tools.tsx`, `src/admin-email.ts`, the Admin home in `src/admin.tsx`, the rules section in `src/tips.tsx`. Tests in `test/admin-tools.test.ts` (23, including both DST offsets); the full suite has 156 and all pass.

- **Admin home** `/admin` links every tool and has "Tägliche E-Mail jetzt senden" (the email job, run by hand).
- **Organizers** `/admin/organizers`: newest first, with upcoming-Event count and a "shares the Display name" note. **Entfernen** sets `blocked_at` (the bot already refuses blocked numbers), ends their running Series with `endSeries`, deletes their Events from today on and their held Flyers, and deletes Flyer images nothing else uses. Past Events stay. To unblock, clear `blocked_at` by hand.
- **Events** `/admin/events?q=`: search by title, Venue, Organizer or Tip name. Upcoming Events come first (soonest first), then past ones (newest first), 50 at most. Each opens `/admin/events/<id>` with the Organizer's edit link (and the Series link). **Organizer zuweisen** (Tip Events and Series Events, active Organizers only) moves a single Tip Event, or the whole Series with all its Events, to the Organizer and clears `is_tip`/`shown_as`. **Flyer entfernen** deletes the R2 object and clears the key on every Event and Series template that shows it. Browsers may still have it cached, since `/flyers/` is served `immutable`.
- **Series** `/admin/series`: running, non-custom Series that run out (`last_sign_of_life` + 84 days) within 28 days, soonest first, each with **12 Wochen verlängern** (`signOfLife`).
- **Free-text rules** are listed under the Tips at `/admin/tips` and link to the Series page, where the Admin picks a real rule or ends the Series.
- **Venues** `/admin/venues/<id>`: edit name, address, latitude and longitude. **Adresse suchen** runs `geocode` and fills in the coordinates without saving. Saving refuses a new name that another Venue has (Venues are matched by name) and coordinates that aren't numbers.
- **Daily email:** a third cron, `0 19,20 * * *`, sends only on the run that is 21:00 in Berlin (`digestDue`), and only when something is pending. It lists Tips (link to the review page), free-text rules (Series link), Organizers who joined in the last 24 hours with their first Event or "noch kein Event" and the "tritt dem bestehenden Display name … bei" flag (`/admin/organizers`), and Series running out within 7 days (`/admin/series`). It uses the `send_email` binding's builder form (`{from, to, subject, text}`).
- **Not live yet: the email.** Cloudflare Email sends only from a domain on Cloudflare with Email Routing and a verified destination address, and the Worker is still on workers.dev. The code reads an optional `EMAIL` binding and the `ADMIN_EMAIL`/`EMAIL_FROM` vars. Until they exist, the job logs a warning and the manual button says "noch nicht eingerichtet". Setting these up moved to **Deploy**. The live demo of Entfernen and Verlängern needs the Admin password (a Worker secret), so it was demoed in tests and locally (`worker-admin` preview) instead.
