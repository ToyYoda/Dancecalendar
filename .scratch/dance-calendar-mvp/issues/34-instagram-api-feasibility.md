# Instagram API for reading Organizers' posts

Type: research
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
