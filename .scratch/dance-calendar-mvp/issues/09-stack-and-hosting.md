# Stack and hosting choice

Type: grilling
Labels: wayfinder:grilling
Blocked by: 01, 02, 04
Status: resolved

## Question

Which tech stack and hosting should the MVP use, given a single maintainer, near-zero running costs, a public HTTPS webhook for WhatsApp, calls to the extraction model, image storage for Flyers, a small database, and a mobile-first web front end? Decide language/framework, database, hosting provider, and where Flyer images live — informed by "WhatsApp bot feasibility and cost", "Flyer extraction model and cost" and "Geocoding and distance for Venues".

## Answer

Settled with the human, 2026-10-31. See [ADR 0002](../../../docs/adr/0002-typescript-on-cloudflare-workers.md). Prices and limits come from a fact check run while grilling; key figures are below.

- **Language and runtime:** TypeScript on **Cloudflare Workers, free plan**.
  - Python (the maintainer's slight preference) was dropped.
  - Python on Workers is Pyodide-based, and its docs don't confirm the `anthropic` SDK, queue consumers, or a fit within the free plan's 10 ms CPU limit.
  - Python on Hetzner would cost about €6–10/month (CX23 €5.49 + €0.50 IPv4 since June 2026, often unavailable) plus server upkeep.
- **One app:** a single Worker using **Hono**, pages rendered on the server with Hono JSX, plus a little plain JS (as in the Dancer prototype). No SPA, no separate API.
- **Webhook:** check the signature, drop duplicate deliveries (by message id), reply 200 at once, enqueue on **Cloudflare Queues**. Meta gives no hard timeout but retries for up to 7 days without a quick 200.
- **Queue consumer:** download the Flyer from Meta immediately (its URL expires after 5 minutes) into R2, run the Haiku extraction (with the Sonnet retry), then the bot replies. No LLM call ever happens inside the webhook request.
- **Data:**
  - **D1** (SQLite) for everything relational.
  - **R2** for Flyers, stored as received (no resizing) and served to Dancers through the app with long cache headers, so takedowns and retention deletes happen in one place.
  - Both are created with the `eu` jurisdiction.
  - Sizing: about 60 MB of Flyers a month, about 180 MB kept, far below the 10 GB free.
- **Cron Triggers:**
  - extend Series 12 weeks ahead
  - delete past Events (and their Flyers) about 3 months after they happen, and Tip data within 30 days
  - send the daily Admin email
- **Admin:**
  - `/admin` sits behind **Cloudflare Access** (free, a one-time code to the Admin's email); no login of our own.
  - A **daily email at about 08:00**, only when something is pending (new Tips, new auto-approved Organizers, free-text Series rules), sent through Cloudflare Email to the Admin's verified address.
  - Organizers never log in; they use private edit links.
- **Backups:** D1 Time Travel for recent days, plus a **weekly GitHub Action** that exports a SQL dump to a private R2 bucket, keeping the last 8.
- **Code and deploy:**
  - Private GitHub repo [ToyYoda/Dancecalendar](https://github.com/ToyYoda/Dancecalendar); every push to `main` deploys via GitHub Actions (Wrangler).
  - The Cloudflare API token is a GitHub secret; the Anthropic key, WhatsApp token and app secret are Worker secrets.
- **Running cost:** €0 for hosting, plus the Claude calls (under $1/month at the expected volume).
- **Legal follow-up:** Cloudflare joins the processor list. Accept its Customer DPA (it applies only once agreed), and name it in the privacy policy next to Meta and Anthropic.
- **Left for later:** the domain and the Cloudflare account setup go to Deploy; the test setup goes to Build.
