# Instagram API for reading Organizers' posts

Type: research
Status: resolved
Labels: wayfinder:research

## Question

Can DanceCalendar automatically pick up new Flyers that Organizers post on their own Instagram accounts, through official routes only (no scraping, which breaks Instagram's Terms)? Find out:

- Which official API reads another account's posts and stories: Instagram API with Instagram Login ("Business Login for Instagram") vs. with Facebook Login, the Graph API's Business Discovery. Which account types work (Business, Creator, private personal), and what each Organizer must do (convert their account, link a Facebook Page, log in once to grant access)?
- Permissions and App Review: which permissions (e.g. `instagram_business_basic`), whether reading posts of accounts that granted access needs Advanced Access / App Review / business verification, and whether a private person as the business portfolio owner (see [Meta business portfolio and WhatsApp number setup](14-meta-whatsapp-setup.md)) can get it. Can the existing Meta app be reused?
- How new posts are noticed: is there a webhook for new media or stories, or must the Worker poll (rate limits, a cron every N minutes for ~10–30 accounts)? Stories expire after 24 h: are they readable at all, and how?
- What a post gives us: image URL(s) incl. carousels, caption, timestamp, permalink; how long media URLs stay valid; video/Reels covers.
- Token lifetime and refresh (long-lived tokens, 60 days?), what happens when an Organizer revokes access.
- Terms and GDPR: is storing a post's image and showing it as the Flyer allowed under the Platform Terms / Instagram Terms, and what does the privacy policy need to add?
- Cost (expected €0) and anything that makes the route a dead end for a single maintainer.

Recommend one route, or say that none is viable and why.

## Answer

**Viable through one route: Business Discovery via the Instagram API with Facebook Login, called only with the Admin's own token, and polled by a Worker cron.** No live test yet; everything below is from Meta's docs and terms.

- **Organizers** need a public Instagram **Business or Creator** account. They do no Meta login and need no Facebook Page; they give us their handle and agree to the import and to the post image being shown as the Flyer. That opt-in is our own record. Personal and private accounts can't be reached on any route, so those Organizers keep using WhatsApp.
- **Admin:** needs their own Instagram professional account linked to a Facebook Page they administer. Add the Instagram product to the existing "DanceCalendar" app (probably possible, not confirmed). Permissions: `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`. A user token lasts about 60 days. Whether the system user `dancecalendar-bot`'s non-expiring token works is not documented.
- **No App Review:** only the Admin, who holds a role on the app, uses it, so Standard Access is enough. Every route where Organizers log in needs Advanced Access, which means App Review plus business verification. Verification needs company documents (Gewerbeanmeldung and similar) that a private person doesn't have. **Dead end.**
- **Polling, no webhook:** no setup has a webhook for new posts or stories. With one user the limit is 200 calls/hour: 30 accounts every 15 minutes is 120/hour. Hand new posts to the queue rather than doing everything in the cron run.
- **Stories: not readable** on this route. They'd need per-Organizer Facebook Login plus Advanced Access.
- **A post gives us** `media_url`, `caption`, `timestamp`, `permalink` and carousel `children`, all asked for nested in one call. The caption is only on the top-level post. Media URL lifetime isn't documented, so download the image during the poll.
- **Terms/GDPR:** Instagram gives us no licence to the images, so the Organizer's opt-in is what allows showing them. Platform Terms ask for a deletion option, privacy-policy text, and a written processor commitment from the AI provider. Delete the data on opt-out.
- **Cost:** €0. **Risk:** Meta changes these APIs often; keep WhatsApp primary.
- **Before building**, one live call (see [Business Discovery test call](36-business-discovery-test-call.md)) must confirm Standard Access, the nested fields and the token.

Details and sources: [research/instagram-ingest.md](../research/instagram-ingest.md)
