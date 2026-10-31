# WhatsApp happy path for a registered Organizer

Type: task
Blocked by: 16
Labels: wayfinder:task

## Scope

A registered Organizer forwards a Flyer, taps [Veröffentlichen], and the Events are live. See [WhatsApp bot feasibility](01-whatsapp-bot-feasibility.md), [Organizer confirmation flow](08-organizer-confirmation-flow.md), [Stack and hosting](09-stack-and-hosting.md), [Extraction accuracy](13-extraction-accuracy.md) and [Meta setup](14-meta-whatsapp-setup.md).

- **Webhook:**
  - GET verification handshake with `WHATSAPP_VERIFY_TOKEN`
  - POST: check the `X-Hub-Signature-256` signature against `WHATSAPP_APP_SECRET`
  - drop duplicate deliveries by message id
  - reply 200 at once and put the message on a Cloudflare Queue
  - no LLM call inside the request
- **Queue consumer:**
  - download the media from Meta right away (its URL expires after 5 minutes) into R2
  - run one Sonnet 5.5 extraction (effort medium) with structured output
  - run the code checks for uncertain fields
- **Prompt and schema:** move the v2 prompt and schema out of `eval/extract_eval.py` into `src/extraction/prompt.md` and `src/extraction/schema.json`, and make the eval read those files. Re-run the eval once to confirm the results are unchanged.
- **Bot reply:**
  - "Ich habe N Events erkannt"
  - a summary in WhatsApp text with ⚠️ on uncertain fields
  - reply buttons [Veröffentlichen] [Ändern ✏️] [Verwerfen]
  - Veröffentlichen publishes immediately and replies "✅ Ist online!" with a private edit-link URL per Event (the link target itself is built in [Edit links](19-edit-links.md))
  - Verwerfen deletes the held Flyer
  - Ändern replies with a placeholder until [Web confirm page and Admin upload](18-confirm-page-and-admin-upload.md)
- **First reply to a number:** includes the AI disclosure, the privacy link and a route to a human. STOP is honoured.
- **Senders:** Organizers are seeded by hand (a SQL insert or a wrangler command). Unknown senders get a short "not yet open" reply until [Organizer application](20-organizer-application.md).
- **Tests:**
  - recorded Meta webhook payloads signed with a test secret
  - the Anthropic and Graph APIs faked at the `fetch` boundary
  - assertions on the messages the bot sends

## Done when

- Tests are green in CI and the slice is deployed.
- Demo: from the Admin's own phone (seeded as an Organizer), forward sample Flyer 03 to the bot → tap Veröffentlichen → its Events show in the week feed.
- The eval re-run matches the v2 results.
- First check whether a Meta app in Development mode delivers real (not test) message webhooks, and note the answer in this ticket's Comments.

## Human steps

- Load the `.dev.vars` secrets (all except the PIN) with `wrangler secret put`, plus the Anthropic key.
- In the Meta app: set the webhook callback URL (workers.dev) with the verify token and subscribe to the `messages` field.
- Upload an app icon (512–1024 px), enter the interim privacy and data-deletion URLs and the EU data-protection contact, and switch the app to Live mode.

## Out of scope

Blocking questions, Series, Venue geocoding (Venues are matched by name or created bare), duplicates and Tips.
