# Instagram ingest of Organizers' Flyers

Researched 2026-11-02 for ticket `issues/34-instagram-api-feasibility.md`. Sources are Meta's developer docs (the new `developers.facebook.com/documentation/instagram-platform` tree, API version v26.0 in the samples), Meta's Platform Terms, the Instagram Terms of Use and Meta's Business Help Center unless marked *secondary*. Most Instagram doc pages carry no date. Where a date matters, it comes from the [changelog][changelog].

## Recommendation

Use **Business Discovery** through the **Instagram API with Facebook Login**, called only with the **Admin's own** token, and have the Worker **poll** each Organizer's public Business or Creator account on a cron.

- Organizers do nothing on the Meta side: no login, no consent screen, no Page. They give DanceCalendar their Instagram handle and agree to have their posts imported. That opt-in is our own record, not a Meta step.
- Only the Admin uses the app, so it stays on **Standard Access**. That means **no App Review and no business verification**, which a private-person portfolio cannot get (see below).
- Stories cannot be read on this route. Posts and carousels can.

Every route where Organizers log in themselves (Instagram Login, Facebook Login, Unified Login) needs **Advanced Access**. Advanced Access needs **App Review plus business verification**, and verification needs official company documents that a private individual does not have. **Those routes are a dead end** unless the Admin registers a business (for example a Gewerbe).

Two things still need a live test before building: whether a system-user token works for Business Discovery, and whether nested `children` work on carousels (see Open points).

## Routes compared

| Route | Who logs in | Access needed for real Organizers | Fit |
|---|---|---|---|
| **Business Discovery** (Facebook Login or Unified Login setup) | Only the Admin, once | Standard. The only app user is the Admin, who has a role on the app | **Best, and the only one open to a private person.** Reads public posts of any Business/Creator account. No stories. |
| Instagram API with Instagram Login ("Business Login for Instagram") | Each Organizer, via instagram.com OAuth | Advanced: "Advanced Access is needed if your app serves professional accounts you don't own or manage" ([Business Login][bizlogin]) | Blocked by App Review and business verification. Also has no `/stories` endpoint (that endpoint documents only Facebook User tokens: [Stories][stories]). |
| Instagram API with Facebook Login | Each Organizer, via Facebook. Their IG account must be linked to a Facebook Page they can administer ([overview][overview]) | Advanced | Blocked. Heaviest onboarding. It is the only route with `/stories`. |
| Instagram API with Unified Login (new; called "recommended setup for new integrations") | Each Organizer, via Instagram or Facebook. Each needs a **business portfolio** that owns the IG account ([Unified Login][unified], [eligibility][ul-elig]) | Advanced: "To connect clients who don't have a role on your app, you need Advanced Access … granted through App Review" and Live mode ([eligibility][ul-elig]) | Blocked, and its onboarding is unrealistic for dance teachers. |
| Instagram testers on Standard Access (adding Organizers as app roles) | Each Organizer accepts a tester invite | Standard | **Not recommended.** Standard Access is meant for "an app only for a business I own or manage" ([App Review][appreview]). Unverified apps are capped at "up to 50 testers" ([app roles][roles]). Treating role slots as a production user base goes against the purpose of the access levels. |
| Basic Display API | n/a | n/a | **Gone.** Deprecated on 2024-12-04; "all its requests now return an error" ([changelog][changelog]). |
| Scraping, unofficial clients, RSS bridges | n/a | n/a | **Forbidden.** The Instagram Terms bar "accessing or collecting information in an automated way without our express permission" (*own translation of the German text*), even while logged in ([Instagram Terms][igterms], effective 2025-01-01). |

## Account types

- Business Discovery returns "basic metadata and metrics about other Instagram professional accounts" ([Business Discovery][bd]). The target must therefore be a **Business or Creator** account. Personal accounts, private personal accounts in particular, are not reachable on any route. Unified Login, for example, fails with "(#10) Access is denied because the instagram account type is not business or creator" ([eligibility][ul-elig]).
- "Data about age-gated Instagram professional accounts will not be returned" ([BD reference][bdref]).
- **What each Organizer needs:** a public Instagram Business or Creator account. Switching an account to Creator is free and done in the Instagram app. Nothing on the Meta developer side is needed.
- **What the Admin needs:** their own Instagram **professional** account (for example `@dancecalendar`), linked to a **Facebook Page** the Admin administers, because the Facebook Login setup requires a Page ([overview][overview]). Every Business Discovery call runs on that account's IG user ID: `GET /<ADMIN_IG_USER_ID>?fields=business_discovery.username(<organizer>){…}` ([BD guide][bd]).

## Permissions, App Review and business verification

- **Business Discovery permissions:** "A Facebook User access token" with `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement`. Add `ads_management` or `ads_read` if the Page role came through Business Manager ([BD reference][bdref]). It is "Available for the Instagram API with Facebook Login". The guide adds Unified Login ([BD guide][bd]).
- **Standard Access covers the Admin.** Business, Consumer and Gaming apps get Standard Access to all their permissions automatically. Those permissions "can only be requested by app users who hold a role" (*translated from the German page*) ([access levels][levels]). App Review's table puts "an app only for a business I own or manage" on Standard Access with no review ([App Review][appreview]). The docs never discuss Business Discovery under Standard Access as a special case. Since the token belongs to a role holder (the Admin), nothing in them requires more. **Confirm with one live call** (see Open points).
- **Advanced Access means App Review plus business verification.** "Your app must complete Meta App Review to be granted Advanced Access", and "You must complete Business Verification if your app requires Advanced Access" ([overview][overview]). Advanced Access has required business verification since 2023-02-01 ([access levels][levels]). Apps used only by role holders "do not need to complete verification" ([business verification][bv]). App Review itself wants a screencast per permission, a privacy-policy URL, an app icon and test credentials ([App Review][appreview]).
- **Can a private-person portfolio be verified? In practice, no.** The documents must confirm "the legal name of your business and the official postal address or phone number of your business" (*translated from the German help page*). The accepted types are a certificate of incorporation or articles of association, a trade registration (Gewerbeanmeldung) or licence, an officially issued tax document for the business ("self-filed tax documents are not accepted"), or a business bank statement. A utility bill only counts for address and phone, and only if it shows the legal business name ([accepted documents][bvdocs], read in the browser). The Admin as a private person has none of these. A Gewerbeanmeldung would make DanceCalendar a business, which goes against the project's setup.
- **Reusing the existing Meta app: probably yes.** The Instagram product needs a **Business-type** app ("Your app must be a business type app to be able to add the Instagram product"). For an existing app, the guide says "start with Step 6", which adds the product ([create an app][createapp]). "DanceCalendar" was created through a business use case (WhatsApp) and is owned by the portfolio, so it should qualify. Not confirmed in the dashboard. If the use cases cannot be combined, a second app in the same portfolio is free (limit: 15 apps per developer, [create an app][createapp]).

## Noticing new posts: webhook vs. polling

- **There is no webhook for new media or new stories in any setup.** The full field list covers `comments`, `live_comments`, `mentions`, messaging fields and `story_insights` ([webhook fields][whfields]). So the Worker **must poll**.
- **Rate limit for Business Discovery:** Platform Rate Limiting, "Calls within one hour = 200 * Number of Users". With one user (the Admin) that is **200 calls/hour** ([rate limiting][rl]). One call per Organizer can return their latest media with all needed fields inline. **30 Organizers every 15 minutes is 120 calls/hour**, and every 10 minutes is 180. Polling every 15–30 minutes leaves headroom for retries. (The Instagram-Login BUC limit, "4800 * Number of Impressions" per 24 h, does not apply to Business Discovery: [rate limiting][rl].)
- **Cloudflare Workers free plan:** 5 Cron Triggers per account, 50 subrequests per invocation, 10 ms CPU per cron invocation (network waits don't count as CPU) ([Workers limits][cf]). Thirty Business Discovery calls fit in one invocation. Downloading new images and calling the AI model also count toward the 50, so hand new posts to a queue or to the next invocation rather than doing it all in one run.
- **Dedup:** keep the last seen media `id` (or `timestamp`) per Organizer and process only newer items. The `/media` edge "Returns a maximum of 10K of the most recently created media" and supports `since`/`until` on the owner's own edge ([IG User media][usermedia]). For Business Discovery, asking for a small page of the newest posts is enough.

## Stories

- Stories come only from `GET /<IG_USER_ID>/stories`, with the **owner's** Facebook User token (`instagram_basic`, `pages_read_engagement`). "Stories are only available for 24 hours". Reshared stories and Live Video stories are not returned ([Stories][stories]). The `/media` edge says "Story IG Media not supported" ([IG User media][usermedia]).
- Business Discovery documents no stories ([BD guide][bd]). **So stories need each Organizer to onboard through Facebook Login with a linked Page, plus Advanced Access. Not viable.** Organizers who announce events only in stories should keep sending the Flyer to the WhatsApp bot.

## What a post gives us

- **Fields** ([IG Media][media]): `id`, `media_type` (`IMAGE`, `VIDEO`, `CAROUSEL_ALBUM`), `media_url`, `permalink`, `timestamp`, `caption`, `alt_text`, `thumbnail_url`, `username`, plus the `children` edge for albums. All are marked public. `media_product_type` (`FEED`/`STORY`/`REELS`/`AD`) is Facebook-Login-only.
- **Business Discovery caveat:** it "does not grant you permission to access media objects directly" ([BD guide][bd]). Request every field nested inside the one call, e.g. `media.limit(10){id,media_type,media_url,permalink,timestamp,caption,thumbnail_url,children{media_type,media_url}}`. The docs' samples only show counts. Nested `caption`/`media_url`/`children` follow from the fields being public but need a live test.
- **Carousels:** each image is a child. The caption lives only on the top-level object, and `permalink` "can't be used on children" ([IG Media][media]). A Flyer carousel has to be fed to the AI model as several images with one caption.
- **Videos and Reels:** `thumbnail_url` is "Only available on `VIDEO` media". Since 2026-07-30, `media_url` is left out for video with copyrighted or licensed audio. On reads of other accounts' media (which includes Business Discovery), it is also left out for reels whose owner turned off downloads. Meta says to "Treat `media_url` as an optional field … and fall back to `permalink` or `thumbnail_url`" ([IG Media][media], [changelog][changelog]). Flyers are usually images, so this matters little.
- **URL lifetime: not documented by Meta.** The reference only calls `media_url` the media's URL. Third parties report that the CDN URLs are signed and expire within days, and story URLs within 24 h (*secondary*: [Iframely][iframely], [CM.com][cm]). **Download the image during the poll and store our own copy** (as with WhatsApp media).

## Tokens and revocation

- **Admin token (Business Discovery):** a Facebook User token. "A long-lived token generally lasts about 60 days", and "You can not use an expired token to request a long-lived token", so the Admin would have to log in again about every 60 days ([long-lived tokens][fbtokens]). **Better:** the portfolio's existing system user `dancecalendar-bot` (non-expiring token, see `issues/14-meta-whatsapp-setup.md`) with the IG account and Page assigned as assets. Standard Access allows 1 system user per portfolio, which already exists ([system users][sysusers]). The Business Discovery reference asks for a "Facebook User access token", and it is **not documented whether a system-user token is accepted**. Test it. If it fails, add a 50-day reminder for the Admin to refresh the token.
- **Organizer tokens (Instagram Login, for comparison only):** the code is valid for 1 hour. A short-lived token is exchanged for a 60-day long-lived one, which can be refreshed if it is ≥ 24 h old and unexpired. "Tokens that have not been refreshed in 60 days will expire and can no longer be refreshed" ([Business Login][bizlogin]). Unified Login gives a Business Integration System User token that belongs to the client's portfolio. It fails if the client "removes your app" or moves the account ([eligibility][ul-elig]).
- **Revocation on the recommended route:** there is no Organizer token to revoke. An Organizer opts out by telling us, by switching to a personal account, or by age-gating, and Business Discovery then returns nothing. Our own opt-out must stop polling and delete their stored Platform Data (next section).

## Terms and GDPR

- **Meta Platform Terms** ([Platform Terms][pt], last updated 2026-02-03; the German text read via the docs site, translations ours):
  - Process Platform Data only for the "permitted purposes in the developer documentation" (§ 3.a.viii). Showing a professional account's public posts as Events is close to Business Discovery's stated purpose, but the docs do not spell it out. Do not sell or license the data (§ 3.a.iv). Do not build profiles without consent (§ 3.a.v).
  - Delete Platform Data "as soon as reasonably possible" when it is no longer needed or the user asks (§ 3.d.i.2). Offer an "easily accessible and clearly labelled option" to request deletion (§ 3.d.i.1).
  - The privacy policy must say what data we process, how and why, and how to request deletion (§ 4.a–b).
  - **The AI model provider is a service provider:** it must have agreed in writing to process the data only for us and on our instructions (§ 5.a.i). Check that the AI provider's API terms and DPA say this. They likely do, as the WhatsApp ticket found for no-training.
  - The Terms contain no clause that forbids displaying Platform Data publicly.
- **Instagram Terms** ([Instagram Terms][igterms], effective 2025-01-01): users keep ownership of their content and license it only to Instagram ("We do not claim ownership of your content, but you grant us a license to use it", *own translation*). **No licence flows to DanceCalendar.** The Flyer is the Organizer's copyrighted work (and may show people), so showing our stored copy needs **the Organizer's permission**. Make that part of the opt-in: "DanceCalendar may import new posts from @handle, extract Events, and show the post image as the Flyer". Keep the consent record (it also fits Platform Terms § 3.c.ii.3).
- **GDPR (for the legal ticket to word):**
  - Legal basis: consent, or performing the Organizer's request (Art. 6(1)(a)/(b)), for the Organizer's handle and images. People shown on a Flyer stay under the Organizer's responsibility, as with WhatsApp Flyers.
  - Privacy policy additions: Instagram as a source, Meta as the origin of the data, Business Discovery polling, which fields we store (handle, post id, permalink, caption, image copy, timestamp), how long we keep them, the AI provider as processor, and how to opt out or request deletion.
  - Retention: drop the stored image and caption when the Event is past and no longer shown, or on opt-out.
  - Link to the original post via `permalink`.
- **Alternative for display:** embedding via oEmbed avoids storing the image (no token needed since 2026-05-15, [changelog][changelog]). It loads Instagram's scripts and cookies, though, so it needs a consent click under TTDSG/GDPR. A stored copy is simpler.

## Cost

**€0.** No Meta fee for Graph API calls. The calls run within the Worker free plan. The Admin needs an Instagram professional account and a Facebook Page, both free. App Review costs nothing either, but it is unreachable.

## Dead ends and risks for a single maintainer

- **Business verification as a private person:** no accepted document ([accepted documents][bvdocs]). This blocks every route where Organizers log in.
- **Stories:** unreadable without per-Organizer Facebook Login and Advanced Access.
- **Personal or private Organizer accounts:** unreachable on every route. Those Organizers keep using the WhatsApp bot.
- **Token upkeep:** about every 60 days unless a system-user token works.
- **Meta changes the Instagram APIs often.** Basic Display was removed (2024-12), the scopes renamed (2025-01), `media_url` dropped for some videos (2026-07), and Unified Login is new ([changelog][changelog]). Plan for occasional breakage, and keep the WhatsApp bot as the primary channel and Instagram as a bonus.
- **Caption-only Events:** some posts carry the event details in the caption, not in the image. The extractor should read both.
- **Admin's role:** the Admin must stay an administrator of the app, the Page and the IG account. If their Facebook account is restricted, ingest stops.

## Open points for a spike before building

1. One live call with the Admin's token in Graph API Explorer: `business_discovery.username(<an Organizer>){media.limit(5){id,media_type,media_url,permalink,timestamp,caption,children{media_type,media_url}}}`. It confirms that Standard Access works, that nested caption, URL and children come back, and the paging syntax.
2. Whether `dancecalendar-bot`'s system-user token (with the IG account and Page assigned) is accepted for Business Discovery.
3. Whether the existing "DanceCalendar" app can add the Instagram / Facebook Login for Business use case next to WhatsApp, or needs a second app.
4. How long a `media_url` actually stays valid (measure it). This only matters if download fails during the poll.

[overview]: https://developers.facebook.com/docs/instagram-platform/overview
[igl]: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
[bizlogin]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login.md
[unified]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login
[ul-elig]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/eligibility-and-troubleshooting
[appreview]: https://developers.facebook.com/documentation/instagram-platform/app-review.md
[createapp]: https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app.md
[levels]: https://developers.facebook.com/docs/graph-api/overview/access-levels
[bv]: https://developers.facebook.com/docs/development/release/business-verification
[bvdocs]: https://www.facebook.com/business/help/159334372093366
[roles]: https://developers.facebook.com/docs/development/build-and-test/app-roles
[bd]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery
[bdref]: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
[whfields]: https://developers.facebook.com/documentation/instagram-platform/webhooks/fields
[rl]: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
[cf]: https://developers.cloudflare.com/workers/platform/limits/
[usermedia]: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media.md
[stories]: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/stories.md
[media]: https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media.md
[changelog]: https://developers.facebook.com/documentation/instagram-platform/changelog.md
[fbtokens]: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
[sysusers]: https://developers.facebook.com/docs/marketing-api/system-users/overview
[pt]: https://developers.facebook.com/terms/dfc_platform_terms/
[igterms]: https://help.instagram.com/581066165581870
[iframely]: https://iframely.com/help/015914-how-to-deal-with-expiring-images-of-tik-tok-and-instagram
[cm]: https://developers.cm.com/messaging/docs/instagram-messaging-inbound
