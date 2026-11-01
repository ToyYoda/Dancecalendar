# Web confirm page and Admin Flyer upload

Type: task
Status: resolved
Blocked by: 17
Labels: wayfinder:task

## Scope

See [Organizer confirmation flow](08-organizer-confirmation-flow.md) and [Admin view](11-admin-view.md). Use [prototypes/organizer-confirmation-prototype.html](../prototypes/organizer-confirmation-prototype.html) (variant C) as the visual reference.

- **[Ändern]** sends a separate link message to a private, mobile-first **web confirm page**:
  - one card per Event, pre-filled with the extraction and any chat answers
  - yellow = check, red = missing
  - an "eintragen" checkbox per Event
  - Publish stays disabled while anything is missing
  - publishing gives the same "✅ Ist online!" result and edit links as the chat path
- **`/admin/upload`:** the Admin uploads a Flyer image, and it goes through the same queue and extraction into the same confirm page, published under a chosen Organizer. This is how the calendar is seeded before launch. `/admin` gets Cloudflare Access at Deploy; until then, protect it with a secret in the Worker configuration.

## Done when

- Tests are green and the slice is deployed.
- Demo: forward a Flyer → [Ändern] → fix a field on the page → Publish → the change shows in the feed.
- Demo: upload sample Flyer 07 at `/admin/upload` → confirm → it's live.

## Out of scope

Tip review cards (that's [Tips](24-tips.md), which reuses this page) and Venue geocoding.

## Answer

Live since 2026-11-01 (0d06f8a, fixes in 43bd48d and 7095b4a). Both demos passed in production: a WhatsApp Flyer (Latin Social) went chat → [Ändern] → confirm page → online, and sample Flyer 07 went `/admin/upload` → confirm page (date corrected) → online.

- `/c/<token>` confirm page as specified. The token is set lazily on [Ändern]; `submission.source` marks Admin uploads (migration 0003). A past Event starts unticked; the server re-checks on POST.
- [Ändern] is offered even when nothing can be published as is, because the page is where a missing time or a wrong date gets fixed until "Blocking questions in chat" lands.
- Chat and page publish through one claim (`publishSubmission`), so a Flyer can't go online twice.
- `/admin/*` uses Basic auth with the `ADMIN_SECRET` Worker secret until Cloudflare Access. An upload goes R2 → `admin_upload` job on the same queue → waiting page → confirm page; no WhatsApp message. A failed extraction is retried twice, then the waiting page shows the error.
- Extraction prompt v3: a Party without a printed start begins when its intro class ends, flagged uncertain (Flyer 07 now 22:00; the other class-before-party Flyers unchanged).
- Found on the way: a Flyer without a year, sent long after the date, is placed a year ahead with no warning. Ticketed as "Wrong year on an old Flyer without a year".
- The Worker's Anthropic key is the one in the git-ignored `.dev.vars`; after changing it there, copy it to the Worker with `wrangler secret put ANTHROPIC_API_KEY` (the Worker can't read `.dev.vars`). The eval reads it from `.dev.vars` too.

## Comments

**2026-11-01, build session:** built test-first, 43 tests green, checked locally in the browser at phone width. Not deployed yet.

- `/c/<token>` confirm page (`src/confirm-page.tsx`). The token is set lazily on [Ändern], and a new `submission.source` column marks Admin uploads (migration 0003). The server re-checks everything on POST; a past Event starts unticked.
- [Ändern] is now offered even when nothing can be published as is: the page is where a missing time or a wrong year gets fixed until the blocking questions in "Blocking questions in chat" land.
- The chat and the page share `publishSubmission`, which claims the submission first, so a second tap or a second submit gets "schon erledigt".
- `/admin/upload` (`src/admin.tsx`) uses Basic auth with user `admin` and the `ADMIN_SECRET` Worker secret. The Flyer goes to R2 and an `admin_upload` job on the same queue; a waiting page polls, then hands over to the confirm page. No WhatsApp message goes out.

Human steps before the demos:

1. `npx wrangler secret put ADMIN_SECRET` (choose a password; without it `/admin` answers 503).
2. Push to `main` so CI applies migration 0003 and deploys.
3. Demo 1: forward a Flyer → [Ändern ✏️] → fix a field → Publish → the change shows in the feed.
4. Demo 2: upload sample Flyer 07 at `/admin/upload` (user `admin`) under an existing Organizer → confirm → it's live. There's no UI yet for creating Organizers, so insert one with `wrangler d1 execute` if needed.
