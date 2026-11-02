# Extraction eval results

Scored 2026-11-02 against `ground_truth.json`. Fields checked per matched Event: start_time, venue, type (and the undated Series' date on F02). *Caught* = the wrong field was in `uncertain_fields` or tripped a code check (empty time, weekday mismatch, date in the past or > 1 year ahead, inferred year > 183 days ahead). *Silent* = wrong and not highlighted: what an Organizer would miss.

| Model | Flyers | Event count right | GT Events found | Spurious Events | Fields right | Wrong ones caught | Silent errors | Fully clean Flyers | Cost | Latency p50 / max |
|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5@low@v2 | 17 | 16/17 | 23/25 | 0 | 63/66 | 1/3 | 2 | 15/17 | $0.016 | 4.5s / 13.3s |
| claude-haiku-5-5@medium@v1 | 17 | 16/17 | 24/25 | 0 | 67/68 | 0/1 | 1 | 15/17 | $0.018 | 5.4s / 16.2s |
| claude-haiku-5-5@medium@v2 | 17 | 16/17 | 23/25 | 0 | 62/66 | 1/4 | 3 | 14/17 | $0.018 | 5.2s / 12.6s |
| claude-sonnet-5-5@medium@v1 | 17 | 16/17 | 24/25 | 0 | 67/68 | 0/1 | 1 | 15/17 | $0.225 | 2.9s / 8.6s |
| claude-sonnet-5-5@medium@v2 | 17 | 17/17 | 25/25 | 0 | 70/71 | 1/1 | 0 | 16/17 | $0.231 | 3.0s / 8.9s |
| claude-sonnet-5-5@medium@v2-src | 17 | 17/17 | 25/25 | 0 | 69/71 | 2/2 | 0 | 15/17 | $0.230 | 3.0s / 9.0s |
| claude-sonnet-5-5@medium@v3 | 5 | 5/5 | 6/6 | 0 | 17/18 | 1/1 | 0 | 4/5 | $0.064 | 3.0s / 4.0s |
| claude-sonnet-5-5@medium@v4 | 17 | 17/17 | 25/25 | 0 | 70/71 | 1/1 | 0 | 16/17 | $0.235 | 3.4s / 8.2s |
| claude-sonnet-5-5@medium@v4-late | 1 | 1/1 | 0/1 | 1 | 0/0 | 0/0 | 0 | 0/1 | $0.019 | 7.5s / 7.5s |
| claude-haiku-5-5@low@v2 → Sonnet on key flag | 17 | 17/17 | 25/25 | 0 | 70/71 | 1/1 | 0 | 16/17 | $0.116 | 4.4s / 13.3s |
| claude-haiku-5-5@medium@v1 → Sonnet on key flag | 17 | 16/17 | 24/25 | 0 | 67/68 | 0/1 | 1 | 15/17 | $0.168 | 5.0s / 16.2s |
| claude-haiku-5-5@medium@v2 → Sonnet on key flag | 17 | 17/17 | 25/25 | 0 | 69/71 | 1/2 | 1 | 15/17 | $0.124 | 4.7s / 12.6s |

claude-haiku-5-5@low@v2 cascade escalated 7/17 Flyers to Sonnet.
claude-haiku-5-5@medium@v1 cascade escalated 11/17 Flyers to Sonnet.
claude-haiku-5-5@medium@v2 cascade escalated 7/17 Flyers to Sonnet.

## Per Flyer

| Flyer | claude-haiku-5-5@low@v2 | claude-haiku-5-5@medium@v1 | claude-haiku-5-5@medium@v2 | claude-sonnet-5-5@medium@v1 | claude-sonnet-5-5@medium@v2 | claude-sonnet-5-5@medium@v2-src | claude-sonnet-5-5@medium@v3 | claude-sonnet-5-5@medium@v4 | claude-sonnet-5-5@medium@v4-late |
|---|---|---|---|---|---|---|---|---|---|
| F01 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F02 | ok | ok | ok | ok | ok | ok; wrong venue_name⚑ | – | ok | – |
| F03 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F04 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F05 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F06 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F07 | ok | ok; wrong type | ok; wrong type | ok | ok | ok | ok | ok | ok; missed 1; +1 |
| F08 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F09 | ok | ok | ok | ok | ok | ok | ok | ok | – |
| F10 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F11 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F12 | ok; wrong venue_name⚑ | count✗; missed 1 | ok; wrong venue_name⚑ | count✗; missed 1 | ok; wrong venue_name⚑ | ok; wrong venue_name⚑ | ok; wrong venue_name⚑ | ok; wrong venue_name⚑ | – |
| F13 | ok | ok | ok | ok | ok | ok | ok | ok | – |
| F14 | ok | ok | ok | ok | ok | ok | ok | ok | – |
| F15 | ok | ok | ok | ok | ok | ok | – | ok | – |
| F16 | count✗; missed 2; wrong start_time,type | ok | count✗; missed 2; wrong start_time,type | ok; wrong venue_name | ok | ok | – | ok | – |
| F17 | ok | ok | ok | ok | ok | ok | – | ok | – |

⚑ = wrong but highlighted to the Organizer.
