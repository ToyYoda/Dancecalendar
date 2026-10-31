# Walking skeleton: Worker, D1 schema, week feed, deploy

Type: task
Status: claimed
Labels: wayfinder:task

## Scope

Set up the app and deploy it, so every later slice only adds behaviour. See [Stack and hosting choice](09-stack-and-hosting.md) and [ADR 0002](../../../docs/adr/0002-typescript-on-cloudflare-workers.md).

- **Repo root:** a TypeScript Worker using Hono, with pages rendered on the server with Hono JSX. Put `src/`, `wrangler.jsonc` and D1 `migrations/` there.
- **D1 schema** for Organizer, Venue, Event and Series, as settled in [Event data model](06-event-data-model.md):
  - one Venue and one type per Event, several styles
  - Intro class as a field of the Party
  - Festival as one multi-day Event
  - a cancelled flag
- **Seed data:** one seeded Organizer, Venue and Event, shown in a bare week feed at `/` (just a plain list of the week's Events; [Full Dancer overview](23-dancer-overview.md) builds the real feed).
- **Interim legal pages:** placeholder privacy-policy and data-deletion pages at stable URLs, needed for Meta Live mode in [WhatsApp happy path](17-whatsapp-happy-path.md). [Legal pages](27-legal-pages.md) writes the real text.
- **Tests:** Vitest with `@cloudflare/vitest-pool-workers`, so tests run in workerd with local D1/R2/Queues bindings. One behaviour test: GET `/` lists the seeded Event.
- **CI:** a GitHub Actions workflow on push to `main` that runs the tests and then deploys with Wrangler to `*.workers.dev`. If tests fail, nothing is deployed.

## Done when

- Tests are green in CI, and a push to `main` deploys.
- Demo: open the workers.dev URL on a phone and see the seeded Event. Open the privacy and data-deletion pages.
- `GLOSSARY.md` is updated if any new term came up.

## Human steps

- Create the Cloudflare account (free plan) and the D1/R2 resources in the `eu` jurisdiction.
- Create an API token and add it to the GitHub repo secrets.

## Out of scope

Custom domain, Cloudflare Access and the full legal text (all Deploy or later slices).
