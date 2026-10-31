# Flyer extraction model and cost

Type: research
Status: resolved
Labels: wayfinder:research

## Question

Which AI vision model should extract Events from Flyer images and texts (German and English; dance party/workshop flyers with dates, times, venue, styles, prices, often several Events per Flyer and repeating Series)? Compare a few current candidates (at least one Claude model; note others) on: structured-output support, accuracy on dense/stylised flyer images, latency, and cost per Flyer at ~50–200 Flyers/month. Recommend a model and an output shape (fields to extract), and note how to express uncertainty so the Organizer's confirmation step can highlight fields to check.

## Answer

- **Recommendation:** use Claude Haiku 5.5 (`claude-haiku-5-5`, effort `medium`) with structured outputs (a JSON schema). If the output fails validation or a key field (date, time, venue) is flagged, retry the Flyer once on Claude Sonnet 5.5.
- **Cost:** about $0.002 per Flyer on Haiku 5.5 ($0.10/$0.50 per MTok), or under $0.40/month at 200 Flyers. All-Sonnet 5.5 ($2/$10) would cost about $7/month, which is also within budget.
- **Image detail:** Claude 4.7 and later models read images at up to 2,576 px on the long edge, at most 4,784 tokens per image. Heavily re-compressed or rotated images are the documented weak spot.
- **Output shape:** `events[]`, each with type, styles (an enum), ISO date, the weekday as printed, times, venue, city, price as verbatim text, and a `series` rule plus explicit dates. Unknown values are `""`, not null, because a schema allows at most 16 union-type and 24 optional parameters.
- **Uncertainty:** each Event carries a `uncertain_fields[]` list and `notes` from the model. Code adds its own checks: the weekday doesn't match the date, the date is in the past, the Venue is unknown, the time is missing. The confirmation step highlights both.
- **Still open:** how accurate Haiku and Sonnet are on the real sample Flyers. The accuracy evaluation decides which is primary.

Findings and sources: [research/flyer-extraction-model.md](../research/flyer-extraction-model.md)

- Amendment from "Extraction accuracy on the sample Flyers" (2026-10-31): **Sonnet 5.5 alone is primary**, with no Haiku first and no retry cascade. It was more accurate, and faster at effort `medium`. About $0.014 per Flyer.
