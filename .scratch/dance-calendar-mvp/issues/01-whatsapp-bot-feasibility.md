# WhatsApp bot feasibility and cost

Type: research
Status: resolved
Labels: wayfinder:research

## Question

Can a single, near-zero-budget maintainer in Germany run a WhatsApp bot that receives forwarded Flyers (images and text) from Organizers and Dancers and replies with simple choices (e.g. "Is this your event?" yes/no, "confirm these Events")? Which route is viable — official WhatsApp Business Platform (Cloud API) direct, a BSP, or unofficial libraries — and what does each cost per month at ~50–200 inbound Flyers/month? What are the requirements: phone number, Meta Business verification, message templates, the 24-hour service window, interactive buttons/lists, media download, webhook hosting (public HTTPS)? What are the ban/ToS risks of unofficial routes? Recommend one route.

## Answer

**Yes. Use the official Cloud API directly, with no BSP and no unofficial library.**

- Cost should be €0/month from Meta. Inbound messages are free. Replies inside the 24-hour window are service messages, and each number gets 1,000 free per month (from 2026-10-01). At about 2–4 replies per Flyer, 50–200 Flyers come to roughly 100–800 messages. A payment method must still be on file, or service messages stop delivering.
- Needed: a Meta business portfolio, a dedicated number that is not already on WhatsApp (for example a prepaid SIM), and a display name. Business verification is not needed to start.
- No templates are needed as long as the bot only ever *replies*. Admin approvals that come later should go by web or email, or wait for the Organizer's next message.
- Reply buttons allow at most 3 options, each with a label of at most 20 characters. Media URLs expire after 5 minutes and media IDs after 7 days, so download each Flyer right away. The webhook needs public HTTPS with a valid certificate (self-signed is not accepted), signature checks, and handling for duplicate deliveries.
- A BSP only adds fees. Unofficial libraries (Baileys, whatsapp-web.js) break the WhatsApp Terms and risk a ban on the bot's number.

Details and sources: [research/whatsapp-bot-feasibility.md](../research/whatsapp-bot-feasibility.md)
