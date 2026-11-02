# Business Discovery test call

Type: task
Labels: wayfinder:task
Blocked by: 34

## Question

Before the Instagram flow is decided, prove the route from [Instagram API for reading Organizers' posts](34-instagram-api-feasibility.md) works for us (open points 1–3 of [research/instagram-ingest.md](../research/instagram-ingest.md)). Human steps for the Admin, agent help where possible:

1. Create (or reuse) an Instagram professional account for DanceCalendar and link it to a Facebook Page the Admin administers.
2. In the "DanceCalendar" Meta app, add the Instagram / Facebook Login for Business use case next to WhatsApp, or note that a second app in the same portfolio is needed.
3. In Graph API Explorer, with a user token holding `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement`, call `GET /<ADMIN_IG_USER_ID>?fields=business_discovery.username(<a real Organizer's Business/Creator account>){media.limit(5){id,media_type,media_url,permalink,timestamp,caption,children{media_type,media_url}}}`.
4. Repeat the call with the system user `dancecalendar-bot`'s token after assigning it the IG account and Page.

## Done when

The answer records: does the call work on Standard Access; do caption, `media_url` and carousel children come back nested; does the system-user token work (otherwise a 60-day token refresh is needed); same app or second app; the Admin's IG user ID and where tokens are kept (git-ignored `.dev.vars`). If the call fails, the Instagram ingest is not viable and the map is redrawn.
