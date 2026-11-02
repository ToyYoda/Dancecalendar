# Instagram ingest flow

Type: grilling
Labels: wayfinder:grilling
Blocked by: 34, 36

## Question

With the route from [Instagram API for reading Organizers' posts](34-instagram-api-feasibility.md), decide how an Organizer's Instagram posts become Events (Admin's request, 2026-11-02: posts picked up automatically, before launch):

- How an Organizer opts in: per the research, they only give their handle (public Business/Creator account) and agree to the import and to the image being shown; there's no Meta login. Where (application form, edit page, Admin adds it?) and how it's tied to the Organizer behind the WhatsApp number. How is the handle shown to be theirs, so nobody signs up someone else's account?
- Which posts are read: every new post or only ones the model recognises as an event Flyer (`is_event_flyer`)? Stories are not readable. A carousel is several images with one caption; the caption may hold the date while the image doesn't, so the extractor needs both. How often the cron polls (~15 min fits the 200 calls/hour).
- Confirmation: today the Organizer confirms in chat, but the bot never writes first (no paid templates, see [Organizer confirmation flow](08-organizer-confirmation-flow.md)). So does an Instagram Flyer go live at once, wait for the Organizer on a page, or go to the Admin? How are the blocking questions (missing time, new Venue, Series rule, repost) handled without a chat?
- Duplicates: the same Flyer also forwarded via WhatsApp, or reposted on Instagram (the repost/update logic of [Blocking questions in chat, with Venue geocoding](21-blocking-questions.md)).
- Posts from accounts that aren't registered Organizers (Venues, other scenes): in or out?
- Knock-on changes: privacy policy and Terms of Use, Admin tools (connected accounts, a failing token), `GLOSSARY.md`.

The outcome is the decided flow plus the build ticket(s) that apply it.
