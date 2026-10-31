# Extraction accuracy on the sample Flyers

Type: task
Labels: wayfinder:task

## Question

Run Claude Haiku 5.5 and Claude Sonnet 5.5 (structured output, the schema from "Flyer extraction model and cost") over the 17 sample Flyers and score them against the ground truth in [flyer-catalogue.md](../assets/flyer-catalogue.md). Measure: correct Event count, date, start time, Venue, type, and whether `uncertain_fields` catches the wrong ones. The result decides which model is primary and how much an Organizer has to correct. Needs an Anthropic API key from the human (HITL step); the run itself is AFK. Top up the sample with text-only posts and WCS/Urban Kiz Flyers if they turn up.
