# WhatsApp bot feasibility and cost

Researched 2026-10-31 for ticket `issues/01-whatsapp-bot-feasibility.md`. Sources are Meta's developer docs and WhatsApp's legal pages unless marked *secondary*.

## Recommendation

Use the **official WhatsApp Business Platform, Cloud API, directly** (no BSP). At 50–200 inbound Flyers a month, the bot only sends replies inside the 24-hour customer service window. Those are service messages, and each business phone number gets 1,000 free per month, so Meta's charges should be **€0/month**. The only costs are a dedicated phone number (for example a prepaid SIM) and the HTTPS host the web app already needs. A BSP adds a monthly fee and gives this use case nothing extra. Unofficial libraries break WhatsApp's Terms and risk a ban on the bot's number.

## Cost at 50–200 Flyers/month

| Item | Cost |
|---|---|
| Inbound messages (Flyers, button taps) | Free. Meta does not charge for inbound user messages ([pricing][pricing]). |
| Bot replies inside the 24-hour window (service messages) | Free up to 1,000 delivered per number per month, from 2026-10-01. Charged from the 1,001st message. Unused messages do not roll over ([pricing updates][updates]). |
| Template messages (sent outside the window) | Charged per delivered message at the Germany rate card ([pricing][pricing]). Avoid these by design. |
| Meta platform/subscription fee | None stated. Billing is per message only ([pricing][pricing]). |
| Payment method | **Required anyway.** Businesses with no payment method on file by 2026-09-30 have service messages stop delivering from 2026-10-01 ([pricing updates][updates]). A card must be on the Meta account even if the bill stays €0. |
| Phone number | A number that is not already on WhatsApp, for example a few € for a prepaid SIM (see Requirements). |
| Webhook hosting | Whatever already serves the web app. It needs a public HTTPS endpoint. |

Message estimate per Flyer: one reply with the extracted Events and buttons, one confirmation or "live" reply with the edit link, and sometimes a "Is this your event?" prompt. That is about 2–4 service messages per Flyer, so **roughly 100–800 a month at 50–200 Flyers. That fits inside the 1,000 free tier.** Above about 250 Flyers a month, service messages start costing money, at the Germany rate card price (not looked up here).

## Requirements (Cloud API direct)

- **Accounts:** a Facebook or managed Meta account, developer registration, a Meta business portfolio, and a Meta app connected to a WhatsApp Business account ([get started][getstarted]). Meta gives you a test number for development ([get started][getstarted]).
- **Business verification: not required to start.** A new portfolio can register up to 2 business phone numbers, and verification raises that to 20 ([phone numbers][phones]). New portfolios have a messaging limit of 250 unique users per rolling 24 hours, and verification is one way to raise it ([messaging limits][limits]). That limit covers business-initiated messages sent *outside* a customer service window, so replies to Flyers do not count against it ([messaging limits][limits]). The docs state this only by implication.
- **Phone number:** it must be able to receive an SMS or voice-call code. Mobile numbers are recommended, and landline or VoIP numbers work with a voice code. "Numbers already in use with WhatsApp cannot be registered unless they are deleted first" ([phone numbers][phones]). **Use a dedicated number, not the Admin's personal one.** The registered number needs a display name, which Meta may review ([phone numbers][phones]). *Coexistence*, meaning one number in both the WhatsApp Business app and the Cloud API, is available only through Solution Partners or Tech Providers. It is not available to a direct developer ([coexistence][coex]).
- **24-hour customer service window:** "When a WhatsApp user messages you or calls you, a 24-hour timer called a customer service window starts". Each new user message resets the timer. While the window is open, the bot can send free-form text, media and interactive messages. Once it closes, "you can only send pre-approved template messages" ([send messages][send]). Every step in our flow ("Is this your event?", "confirm these Events", "live, here is your edit link") is a direct answer to the user, so **no templates are needed for the MVP.** The flow should never message an Organizer first. If the Admin approves an Organizer application days later, the approval should go by email, by web link, or wait for the Organizer's next message. Otherwise it needs an approved utility template.
- **Interactive buttons:** up to 3 reply buttons, each with a label of at most 20 characters. A tap arrives as a `messages` webhook with `button_reply.id` and `title` ([reply buttons][buttons]). Yes/no and "Confirm / Edit / Cancel" fit within that. For more than 3 options, use list messages or an edit link.
- **Media download:** the webhook carries a media ID and URL. Fetch the media with `Authorization: Bearer <token>`. "Media URLs expire after 5 minutes", so re-query the ID if needed. Media IDs from webhooks expire after 7 days. Images come as JPEG or PNG, at most 5 MB each ([media][media]). **Download the file right away and store your own copy.**
- **Webhook hosting:** the endpoint must use HTTPS with a valid certificate. "Self-signed certificates are not supported." It must answer the verification `GET` by echoing `hub.challenge`, and should check `X-Hub-Signature-256` with the app secret ([webhooks][webhooks]). Meta retries failed deliveries, so duplicate events will arrive and the handler must be idempotent ([set up webhooks][setupwh], [webhooks][webhooks]). The app must be in Live mode to receive all webhooks ([set up webhooks][setupwh]).
- **AI policy:** since 2026-01-15, the Business Platform terms bar providers of *general-purpose* AI chatbots. Bots that use AI for a specific business task are still allowed (*secondary*: [TechCrunch][tc]; we could not fetch the primary terms page). A bot that only extracts Event data from Flyers is in the allowed category.

## Routes compared

| Route | Monthly cost at our volume | Fit |
|---|---|---|
| **Cloud API direct** | €0 Meta charges (within the free tier) + number + existing host | Best. It is official, has no middleman, and supports buttons, media and webhooks. The Admin handles the Meta setup once. |
| BSP / Solution Partner (e.g. Twilio, 360dialog, MessageBird) | Meta charges + the BSP's own platform fee or markup. Solution Partners "can directly invoice their clients" ([solution providers][sp]); fees are not given on Meta's pages | Simpler onboarding and coexistence are possible, but it adds recurring cost and lock-in for no needed feature. Not worth it. |
| Unofficial libraries (Baileys, whatsapp-web.js) on a normal WhatsApp account | €0 software, but needs an always-on process that holds a linked-device session | **Not recommended.** See below. |

### Ban and ToS risks of unofficial routes

- The WhatsApp EEA Terms forbid reaching the service "through automated or other means" in unauthorised ways. They also forbid reverse-engineering the service, and forbid making it available over a network to multiple devices except through WhatsApp's own tools ([EEA Terms][tos]). A bot built on a reverse-engineered client falls under these.
- WhatsApp's help centre has an article on taking action against unauthorised automated or bulk messaging ([FAQ][faq]). Its text could not be fetched, only its title.
- Baileys itself says it is "not affiliated, associated, authorized, endorsed by" WhatsApp. It tells users to "Use at your own discretion" ([Baileys README][baileys]).
- Practical risks: the number can be banned, and all Organizers would then need to switch to a new number. The library can break when WhatsApp changes its protocol. The session has to stay logged in on an always-on host. If the bot ran on the Admin's personal number, a ban would also take out the Admin's own WhatsApp. For a public service that the Admin is legally responsible for, this is the wrong trade.

## Open points for later tickets

- Meta's Germany price per service message above the free tier, and per utility template: see the rate card linked from [pricing][pricing]. This only matters above about 250 Flyers a month or if templates are introduced.
- Whether a private individual, rather than a registered business, can set up the business portfolio and get the display name approved without friction. The docs we read do not say. The Deploy step should test this early.

[pricing]: https://developers.facebook.com/docs/whatsapp/pricing
[updates]: https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing
[getstarted]: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
[limits]: https://developers.facebook.com/docs/whatsapp/messaging-limits
[phones]: https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers
[coex]: https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users
[send]: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
[buttons]: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
[media]: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
[webhooks]: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
[setupwh]: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
[sp]: https://developers.facebook.com/docs/whatsapp/solution-providers
[tos]: https://www.whatsapp.com/legal/terms-of-service-eea
[faq]: https://faq.whatsapp.com/1104252539917581
[baileys]: https://github.com/WhiskeySockets/Baileys
[tc]: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform
