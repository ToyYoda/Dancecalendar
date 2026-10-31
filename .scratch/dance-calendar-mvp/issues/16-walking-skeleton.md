# Walking skeleton: Worker, D1 schema, week feed, deploy

Type: task
Status: resolved
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

## Answer

Done, 2026-11-01. Live at https://dancecalendar.dancecalendar.workers.dev.

- **What's built:**
  - a Hono Worker (`src/`)
  - the D1 schema for Organizer, Venue, Series and Event (`migrations/0001_init.sql`)
  - a bare week feed at `/` (today plus 7 days, Berlin time)
  - interim `/datenschutz` and `/datenloeschung` pages, whose operator contact is still a placeholder
  - a demo seed in `seed/demo.sql`
- **Tests:** 4 behaviour tests go through HTTP requests to the Worker.
  - They use `@cloudflare/vitest-plugin`, the renamed successor of `@cloudflare/vitest-pool-workers`, which is deprecated.
  - Storage isn't reset between tests in this version, so each test clears its tables.
  - Worker types come from `wrangler types` (`worker-configuration.d.ts`). Regenerate them with `npm run cf-typegen` whenever `wrangler.jsonc` changes.
- **CI** (`.github/workflows/ci.yml`):
  - Every push runs the typecheck and tests.
  - On `main` it then runs `npm run deploy` (remote D1 migrations, then `wrangler deploy`).
  - It can also be started by hand (`workflow_dispatch`).
  - The only secret is `CLOUDFLARE_API_TOKEN`, which needs Workers edit plus **D1 Edit**. Without D1 Edit the migration step fails with code 7403.
  - The account ID is committed in `wrangler.jsonc`.
- **Cloudflare:**
  - D1 `dancecalendar` with jurisdiction `eu` (region EEUR), schema and demo seed applied.
  - workers.dev subdomain `dancecalendar`, registered by Wrangler on the first deploy.
  - The R2 bucket is left to slice 17, which is the first slice that needs it.
- **Demo checked:** the live feed shows "Demo Salsa Night", and both legal pages return 200 on the deployed URL.

## Comments

- 2026-11-01: the GitHub repo ToyYoda/Dancecalendar turned out to be **public**, while ticket 09 says it's private. The Admin was told; whether to make it private is their call.
- Before Meta Live mode (slice 17), the interim privacy page needs the operator's real name and contact.
