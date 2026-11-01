# Retention and backups

Type: task
Blocked by: 16
Status: resolved
Labels: wayfinder:task

## Scope

See [Stack and hosting choice](09-stack-and-hosting.md) and [Legal requirements](03-legal-requirements.md).

- **Retention:** a Cron Trigger deletes past Events and their Flyers in R2 about 3 months after they happen. Tip data is handled in [Tips](24-tips.md).
- **Backups:** a weekly GitHub Action exports a D1 SQL dump to a private R2 bucket and keeps the last 8.

## Done when

- Tests are green (retention run with a fixed clock) and the slice is deployed.
- Demo: the Action runs by hand and a dump appears in the bucket.
- Restoring a dump into a scratch D1 database works once, and the steps are written into the ticket.

## Human steps

- Create the private backup bucket (`eu`) and the token the Action needs.

## Answer

Done 2026-11-01, deployed to workers.dev (commit ff7d471). Code: `src/retention.ts`, `.github/workflows/backup.yml`; tests in `test/retention.test.ts` (fixed clock 2026-11-01). The full suite has 163 tests and all pass.

**Retention** runs first in the daily 02:30 cron (`30 2 * * *`), before the Series generate their dates (`cleanUpPast`):

- Events whose end (or start, without an end) is more than 90 days ago. A Festival counts from its last day.
- Series that ended, or ran out (`last_sign_of_life` + 84 days), more than 90 days ago, once they have no Events left.
- Published and discarded submissions after 90 days (their `extraction` holds Event data). An Organizer's Flyer left pending goes after 30 days. Tips keep their own 30-day clean-up (`tips.tsx`).
- WhatsApp message ids (`inbound_message`, only used to stop duplicates) after 7 days.
- The Flyers in R2 of everything above, unless an Event, a running Series or a held Flyer still uses them. `deleteUnusedFlyers` moved here from the Admin tools, which share it.

Organizer data after leaving (the legal checklist's "≤ 3 months after leaving") isn't covered: there's no leave flow, and a removed Organizer's number must stay to keep them blocked. It's noted under Deploy on the map.

**Backups:** the private bucket `dancecalendar-backups` (jurisdiction `eu`, private by default) was created with wrangler. The `Backup` workflow runs Sundays 03:00 UTC and on demand. It runs `wrangler d1 export dancecalendar --remote` and uploads to `d1-slot-<N>.sql`, where N = weeks since 1970 mod 8. Eight slots overwritten in turn keep the last 8 weeks with no listing or pruning, and the newest is the one with the latest upload time. It uses the existing `CLOUDFLARE_API_TOKEN` secret, which also needs R2 write (Workers R2 Storage: Edit).

**First Action run** on 2026-11-01 (run 41323962067) succeeded: `d1-slot-5.sql` (about 20 KB, 63 INSERTs) is in the bucket, so the token has R2 write.

**Restore**, tried once on 2026-11-01: the live export went to the bucket and back byte for byte. Restored into a scratch database, it gave the same row counts as live (event 2, organizer 2, venue 3, series 1, submission 3, d1_migrations 8). The scratch database was then deleted.

```bash
npx wrangler r2 object get dancecalendar-backups/d1-slot-<N>.sql --file restore.sql --remote --jurisdiction eu   # newest slot: see the bucket in the dashboard
npx wrangler d1 create dancecalendar-restore --jurisdiction eu
npx wrangler d1 execute dancecalendar-restore --remote --file restore.sql -y
```

Check the restored copy, then switch the Worker over to it (`database_name` and `database_id` in `wrangler.jsonc`, push to deploy), or copy the needed rows back. The dump includes `d1_migrations`, so `wrangler d1 migrations apply` continues where it left off. For the last 30 days, D1 Time Travel (`wrangler d1 time-travel restore dancecalendar --timestamp …`) is quicker.

