# Retention and backups

Type: task
Blocked by: 16
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
