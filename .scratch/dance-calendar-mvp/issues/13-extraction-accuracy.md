# Extraction accuracy on the sample Flyers

Type: task
Labels: wayfinder:task
Status: resolved

## Question

Run Claude Haiku 5.5 and Claude Sonnet 5.5 (structured output, the schema from "Flyer extraction model and cost") over the 17 sample Flyers and score them against the ground truth in [flyer-catalogue.md](../assets/flyer-catalogue.md). Measure: correct Event count, date, start time, Venue, type, and whether `uncertain_fields` catches the wrong ones. The result decides which model is primary and how much an Organizer has to correct. Needs an Anthropic API key from the human (HITL step); the run itself is AFK. Top up the sample with text-only posts and WCS/Urban Kiz Flyers if they turn up.

## Answer

Settled with the human, 2026-10-31: **Claude Sonnet 5.5 alone** (`claude-sonnet-5-5`, effort `medium`, structured output), **no Haiku first, no retry cascade**. This replaces the Haiku-primary recommendation in "Flyer extraction model and cost".

- **Result on the 17 sample Flyers (v2 prompt):** all 25 expected Events found, 70 of 71 checked fields right, **no error the Organizer wouldn't see**; the one miss (Venue of F12's save-the-date) came back empty and flagged. Median 3.0 s, slowest 8.9 s per Flyer; about $0.014 per Flyer, roughly $3/month at 200 Flyers.
- **Why not Haiku:** Haiku 5.5 got the Event structure wrong without flagging it: a workshop as its own Event instead of the Party's Intro class (F07), two Marburg Courses folded into the Party (F16). It was also slower (median 5.2 s), because at the same effort it thinks 2–3× as many tokens. Effort `low` didn't fix either.
- **Why not the cascade (Haiku, retry on Sonnet when a key field is flagged):** just as accurate here, but only because the bad Flyers happened to be flagged. It saves about €1.30/month, adds a retry path, and retried Flyers wait for two model calls.
- **Prompt:** start the build from the v2 system prompt and schema in [extract_eval.py](../eval/extract_eval.py). The schema follows the Event data model (type party/workshop/festival, `intro_class_time`, `level`, `registration_required`, Series rule + listed dates). Rules that mattered: return a dated Event without a time (so the bot can ask), and don't flag the date only because the year was inferred (it caused needless highlights).
- **Known weak spots:** single-letter misreads of Venue names (Sonnet read "Affölderhaus" for "Afföllerhaus" on one run, unflagged). The Venue-match confirmation from "Geocoding and distance for Venues" is the safety net.
- **Keep the eval:** [eval/](../eval/) holds the ground truth, the runner and the scorer, as a regression check for prompt or model changes during the build. Results per run: [eval/results/report.md](../eval/results/report.md). Raw outputs are git-ignored (they echo Flyer text).
- **Sample gaps unchanged:** no text-only posts, no WCS or Urban Kiz Flyers; 17 Flyers is small. Re-run the eval when such Flyers turn up.
