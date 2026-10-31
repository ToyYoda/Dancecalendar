# Web confirm page and Admin Flyer upload

Type: task
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
