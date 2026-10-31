# Slice the build into implementation tickets

Type: grilling
Blocked by: 14
Status: resolved
Labels: wayfinder:grilling

## Question

All flows, the data model and the stack are settled. Into which vertical slices should the MVP build be cut, and in what order, so that each slice is demoable and the first Organizer can post as early as possible? Agree the slice list (e.g. webhook → queue → extraction → chat confirmation for a single Party first; then Series, web confirm page, Dancer overview, Admin view, application form, cron jobs, legal pages), each slice's done-criteria, and the test approach. The outcome is the set of build tickets, created on this map (execution is in scope per the Notes).

## Answer

Settled with the human, 2026-10-31, after ticket 14 resolved. All six proposals were accepted as asked in the resumed round.

- **Order: the bot first, right after the skeleton.** The number is live, and getting Organizers posting early matters most. The web confirm page and Admin upload follow, on the same extraction pipeline.
- **The build tickets.** Each is a vertical slice, demoable on workers.dev:

  | # | Slice | Blocked by |
  |---|---|---|
  | [16](16-walking-skeleton.md) | Walking skeleton (schema, bare feed, CI deploy, interim privacy and data-deletion pages) | none |
  | [17](17-whatsapp-happy-path.md) | WhatsApp happy path for a registered Organizer | 16 |
  | [18](18-confirm-page-and-admin-upload.md) | Web confirm page and Admin upload | 17 |
  | [19](19-edit-links.md) | Edit links | 18 |
  | [20](20-organizer-application.md) | Organizer application | 17 |
  | [21](21-blocking-questions.md) | Blocking questions, with Venue geocoding | 18 |
  | [22](22-series-and-courses.md) | Series and Courses | 21 |
  | [23](23-dancer-overview.md) | Full Dancer overview | 16 |
  | [24](24-tips.md) | Tips | 20, 21 |
  | [25](25-admin-tools-and-email.md) | Admin tools and the daily email | 22, 24 |
  | [26](26-retention-and-backups.md) | Retention and backups | 16 |
  | [27](27-legal-pages.md) | Legal pages | 16 |

  Slices 16–22 let the first Organizer post. Slices 23, 26 and 27 can run alongside the bot work.
- **Meta webhook and Live mode move into 16–17** (amends [ticket 14](14-meta-whatsapp-setup.md)'s "left for Deploy"):
  - Slice 16 serves interim privacy and data-deletion pages.
  - Slice 17's human steps set the webhook and verify token, load the secrets, upload the icon and switch the app to Live mode.
  - Slice 17 first checks whether Development mode delivers real message webhooks.
  - The custom domain and replacing the interim website stay in Deploy.
- **Test approach:**
  - Vitest with `@cloudflare/vitest-pool-workers`, with local D1/R2/Queues.
  - Anthropic, the Meta Graph API and Photon/Nominatim are faked at the `fetch` boundary; webhook tests use recorded payloads signed with a test secret.
  - There are no live LLM calls in CI, and CI blocks the deploy.
  - Each slice is built test-first with the `tdd` skill, through HTTP requests to the Worker.
- **One extraction source:**
  - The v2 prompt and schema move to `src/extraction/prompt.md` and `src/extraction/schema.json` in slice 17, and the Python eval reads them.
  - The eval is re-run by hand when the prompt, schema or model changes; it is not part of CI.
- **Ticket shape:**
  - Every ticket is `Type: task` with Scope and Out of scope.
  - "Done when" means: CI green, deployed from `main`, a demo script that works on the deployed URL, and the glossary updated.
  - "Human steps" lists what only the Admin can do.
- **Deploy and Launch stay in the fog** until slices 16–22 run.

## Comments

- Paused by the human on 2026-10-31 until "Meta business portfolio and WhatsApp number setup" (14) is resolved. Round 1 was asked but not answered. Proposals still open:
  - Q1: build the web path (Admin upload → extraction → confirm page → feed) before the WhatsApp bot, so only the bot slice needs ticket 14.
  - Q2: 12 slices, in order:
    1. Walking skeleton deployed to workers.dev
    2. Admin Flyer upload with Sonnet extraction and the confirm page
    3. WhatsApp happy path for a registered Organizer
    4. Edit links
    5. Organizer application
    6. Blocking questions in chat, with Venue geocoding
    7. Series and Courses
    8. Full Dancer overview
    9. Tips
    10. Admin tools and the daily email
    11. Retention and backups
    12. Legal pages

    Slices 1–7 are the minimum for the first Organizer. Slices 8, 11 and 12 depend only on slice 1.
  - Q3: Vitest with `@cloudflare/vitest-pool-workers`; Anthropic and Meta faked at the fetch boundary; no live LLM calls in CI; each slice built test-first.
  - Q4: move the prompt and schema to `src/extraction/prompt.md` and `src/extraction/schema.json`, shared by the Worker and the Python eval.
  - Q5: each ticket is `Type: task` with Scope, Done when (CI tests, workers.dev deploy, demo script, glossary) and Out of scope, plus a list of Human steps.
  - Q6: only build tickets now; Deploy and Launch stay in the fog.
