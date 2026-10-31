# Flyer extraction model and cost

Research for ticket `issues/02-flyer-extraction-model.md`. Date: 2026-10-31. All prices are in USD, standard paid API tier, per million tokens (MTok).

## Recommendation

- **Primary model: Claude Haiku 5.5 (`claude-haiku-5-5`)**, with effort set to `medium` (its default) and structured outputs (`output_config.format` with a JSON schema).
- **Fallback: Claude Sonnet 5.5 (`claude-sonnet-5-5`)**, retried automatically when Haiku's output fails validation or flags several key fields as uncertain.
- **Cost:** about $0.002 per Flyer on Haiku 5.5, or $0.04–0.35/month at 50–200 Flyers. Running every Flyer on Sonnet 5.5 would cost about $1.5–7/month, which still fits "a few €/month".
- **Why Haiku 5.5:** Anthropic positions it for extraction and as the fastest model in the lineup. Speed matters because the Organizer waits for the confirmation reply in WhatsApp.
- **Not yet known:** the docs give no accuracy figures for dense or stylised flyers. The choice between Haiku and Sonnet as primary must be settled by the extraction-accuracy evaluation on the sample Flyers (the map's "Extraction accuracy on real Flyers" item). Because the cost gap is only a few euros a month, that evaluation should decide on accuracy, not price.

## Candidates compared

| Model | Input / output $/MTok | Structured output | Latency (vendor label) | Est. $/Flyer | Est. $/month at 200 Flyers |
|---|---|---|---|---|---|
| Claude Haiku 5.5 | 0.10 / 0.50 (prompts ≤100K tokens) | Yes, JSON schema with constrained decoding | "Fastest" | ~0.0017 | ~0.35 |
| Claude Sonnet 5.5 | 2 / 10 | Yes | "Fast" | ~0.033 | ~6.6 |
| Claude Opus 5.5 | 4 / 20 | Yes | "Moderate" | ~0.066 | ~13 |
| Gemini 3.1 Flash-Lite | 0.25 / 1.50 | Not checked here | Not checked | ~0.004 (different tokenizer) | ~0.8 |
| Gemini 3.6 / 3.8 Flash | 0.75 / 3.75 until 2026-12-31, then 1.50 / 7.50 | Not checked here | Not checked | ~0.01–0.02 | ~2–4 |
| OpenAI gpt-6-luna | 0.10 / 0.50 | Not checked (the pricing page doesn't say) | Not checked | ~0.002 | ~0.35 |

Sources: Claude prices from [Anthropic pricing][pricing] and the [Claude Haiku 5.5 overview][haiku]; latency labels from the [models overview][models]; Gemini prices from [Gemini API pricing][gemini]; OpenAI prices from [OpenAI pricing][openai]. I did not check vision quality or structured-output support for the Gemini and OpenAI models, because this ticket only needed one strong option and they are listed for comparison.

### How the per-Flyer cost was estimated

- **Image tokens:** Claude splits an image into 28×28 px patches and charges ⌈w/28⌉×⌈h/28⌉ tokens. On Claude 4.7 and later models, images are downscaled to fit a 2,576 px long edge and a cap of 4,784 visual tokens ([Vision][vision]).
  - A typical 1080×1350 flyer costs 39×49 = 1,911 tokens.
  - A large phone photo hits the cap of 4,784 tokens.
- **Assumptions for one Flyer:** about 6,500 input tokens (the image at its worst case of 4,784, plus about 1,500 for the system prompt, schema and any caption text) and about 2,000 output tokens (JSON for several Events plus adaptive thinking).
- **Haiku 5.5:** 6,500×$0.10/M + 2,000×$0.50/M ≈ $0.0017.
- **Sonnet 5.5:** 6,500×$2/M + 2,000×$10/M ≈ $0.033.
- **Haiku 5.5 long-context surcharge:** prices rise to $0.50/$2.50 above 100K-token prompts ([pricing][pricing]). A single Flyer never comes close to that.
- **Batch API:** 50% off ([pricing][pricing]), but not useful here, because the Organizer waits for a reply.
- **Prompt caching:** the minimum cacheable prefix on Haiku 5.5 is 512 tokens ([haiku][haiku]). At this volume, Flyers rarely arrive within the cache lifetime, so caching saves almost nothing.

## Capability facts relevant to Flyers (Claude)

- **Vision on every current model:** all current Claude models accept image input ([models][models]).
  - Formats: JPEG, PNG, GIF and WebP. For an animated image, only the first frame is used.
  - Limits: 10 MB per image and 8000×8000 px ([vision][vision]).
  - WhatsApp images are JPEGs, so they can be sent as-is.
- **High-resolution tier:** Haiku, Sonnet and Opus 5.5 (Claude 4.7 and later) process images at up to 2,576 px on the long edge, which is about three times the detail of the older 1,568 px tier ([vision][vision]). This helps with small print on dense flyers.
- **Documented weak spots:** Claude "might hallucinate or make mistakes when interpreting low-quality, rotated, or very small images under 200 pixels." Heavy JPEG compression "can make text difficult to read" ([vision][vision]). Forwarded WhatsApp images that were re-compressed several times are the main risk.
- **Structured outputs:** supported on Haiku 5.5, Sonnet 5.5 and Opus 5.5. The response follows the JSON schema through constrained decoding, with these exceptions ([structured outputs][so]):
  - A refusal (`stop_reason: "refusal"`) or hitting `max_tokens` can produce output that doesn't match the schema, so always check `stop_reason`.
  - Enum casing can differ from the schema, so compare case-insensitively.
  - Unsupported schema features include `minimum`/`maximum`, `minLength`/`maxLength`, and recursive schemas.
  - Limits per request: at most **24 optional parameters** and **16 parameters with union types** (`anyOf` or `["string","null"]`). Prefer required fields with an explicit "unknown" value over many nullable fields.
- **Thinking and effort on Haiku 5.5:** adaptive thinking is on by default and effort defaults to `medium`. Do not send `temperature`, `top_p` or `top_k` ([haiku][haiku]). From the claude-api skill reference: forced `tool_choice` is not needed, because `output_config.format` returns JSON directly.
- **Data use on a free tier:** Gemini's free tier is marked "Content used to improve our products"; the paid tier is not ([gemini][gemini]). This is a reason to use a paid tier, whichever vendor is chosen.

## Proposed output shape

One request per Flyer returns:

```jsonc
{
  "is_event_flyer": true,              // false → bot replies "doesn't look like an event flyer"
  "flyer_language": "de",              // "de" | "en" | "other"
  "display_name_on_flyer": "Salsa Kassel",  // "" if none
  "events": [
    {
      "title": "Salsa Night",
      "type": "party",                 // "party" | "workshop" | "course" | "festival"
      "styles": ["salsa", "bachata"],  // enum: salsa, bachata, west_coast_swing, kizomba, urban_kiz, other
      "styles_other": "",              // free text when "other" is used
      "start_date": "2026-11-14",      // ISO date; year inferred if the flyer omits it
      "weekday_on_flyer": "Sa",        // as printed, "" if none — used for the cross-check
      "start_time": "21:00",           // "" if missing
      "end_date": "",                  // for multi-day Festivals or past-midnight end
      "end_time": "03:00",
      "venue_name": "Kulturzentrum Schlachthof",
      "venue_address": "",             // street + city as printed, "" if none
      "city": "Kassel",
      "price_text": "8 € / 5 € erm.",  // kept verbatim; no price filter in MVP
      "description": "",               // short text as on the Flyer, untranslated
      "series": {                      // repeating dates (Series/Course)
        "is_series": false,
        "rule_text": "",               // verbatim, e.g. "jeden Freitag"
        "frequency": "none",           // "none" | "weekly" | "biweekly" | "monthly" | "custom"
        "until_date": "",
        "explicit_dates": []           // ISO dates when the flyer lists them
      },
      "uncertain_fields": ["start_date", "venue_name"],  // what the Organizer must check
      "notes": "Year not printed; assumed next occurrence."
    }
  ]
}
```

Design choices:

- **Unknowns are empty strings, not nulls.** A nullable field counts toward the 16-union-type limit, and 20+ fields per Event would exceed it ([so][so]).
- **Price is verbatim text.** Price filters are out of scope (map.md), so the price never needs parsing.
- **A Series is extracted as a rule plus any explicit dates.** The app expands it into the next 4 weeks of Events, so the model never generates dozens of rows.
- **`weekday_on_flyer` is kept** so that code can check it against `start_date`.

## Expressing uncertainty for the confirmation step

1. **Model-reported:** list field names in `uncertain_fields`, with a short `notes` explanation. Tell the model in the prompt to add a field when it inferred the value (for example the year, the end time, or which Event the venue belongs to) or could not read it clearly. I found no Anthropic documentation of calibrated confidence scores for self-reported uncertainty. A flag list is simpler and enough for highlighting, so use it rather than numeric confidences.
2. **Code-computed checks (more reliable than the model):**
   - The weekday printed on the Flyer doesn't match the weekday of `start_date`.
   - The date is in the past, or more than 12 months ahead.
   - `venue_name` doesn't match a known Venue, which signals a new or misspelled Venue.
   - `start_time` is empty.
   - The time range looks wrong, for example an end time before the start time without an `end_date`.
   - The Event likely duplicates an existing one (the duplicate warning is already decided).
3. **Highlighting:** the confirmation message in WhatsApp and the web form highlights the union of 1 and 2.
4. **Escalation:** if `stop_reason` is not `end_turn`, the output fails validation, or a key field (date, time or venue) is flagged, re-run the Flyer once on Sonnet 5.5 before asking the Organizer.

## Open points (for the accuracy evaluation)

- How accurate Haiku 5.5 and Sonnet 5.5 are on the real sample Flyers, including stylised fonts, several Events per Flyer, and German date formats such as "Sa. 14.11." or "jeden 2. Freitag".
- Whether to downscale images to about 1,600 px before sending, to cut latency, or send the original. Send the original until the evaluation says otherwise; at these prices the cost difference is trivial.
- Which vendor's commercial API terms on training and retention to accept. This research did not cover them; check before launch, because Flyers can contain phone numbers.

## Sources

- [pricing]: https://platform.claude.com/docs/en/about-claude/pricing — Anthropic pricing (model, batch and long-context tables).
- [models]: https://platform.claude.com/docs/en/about-claude/models/overview — Claude models overview (descriptions, comparative latency, vision on all models).
- [haiku]: https://platform.claude.com/docs/en/models/haiku-5-5/overview — Claude Haiku 5.5 overview (positioning, pricing, effort default, sampling parameters).
- [vision]: https://platform.claude.com/docs/en/build-with-claude/vision — Vision (formats, limits, token formula, high-resolution tier, limitations).
- [so]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs — Structured outputs (supported models, guarantees, schema limits).
- [gemini]: https://ai.google.dev/gemini-api/docs/pricing — Gemini API pricing.
- [openai]: https://developers.openai.com/api/docs/pricing — OpenAI API pricing.

[pricing]: https://platform.claude.com/docs/en/about-claude/pricing
[models]: https://platform.claude.com/docs/en/about-claude/models/overview
[haiku]: https://platform.claude.com/docs/en/models/haiku-5-5/overview
[vision]: https://platform.claude.com/docs/en/build-with-claude/vision
[so]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
[gemini]: https://ai.google.dev/gemini-api/docs/pricing
[openai]: https://developers.openai.com/api/docs/pricing
