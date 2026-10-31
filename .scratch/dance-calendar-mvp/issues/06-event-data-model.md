# Event data model, including Series and Course

Type: grilling
Status: resolved
Labels: wayfinder:grilling

## Question

What exactly does an Event hold, and how are Series and Courses represented? Settle the fields (title, type, styles — one or several?, start/end, Venue, Display name/Organizer, description, price?, link, cancelled flag, source Flyer, Tip origin), how a Series is stored (rule vs. expanded occurrences; how far ahead; editing or cancelling one occurrence vs. the whole Series), how a Course differs from a Series of Workshops in data, and how a Festival's inner Workshops/Parties relate to it.

## Comments

- From "Collect sample Flyers": see [flyer-catalogue.md](../assets/flyer-catalogue.md). Cases this ticket must settle: Workshop + Party bundled on one Flyer (one Event or two?), ambiguous "jeden 2. Mittwoch" Series, Series Flyer with no date (F02), Festival over two venues with no inner schedule (F05), save-the-date with date only (F12), end time past midnight (F10), two floors with different styles at one Party (F07).

## Answer

Settled with the human, 2026-10-31.

- **Event** holds: title as on the Flyer; type (Party / Workshop / Festival, exactly one); styles (several, fixed list: Salsa, Bachata, Kizomba, Urban Kiz, West Coast Swing; other styles stay in the text); start (date + time, required); optional end (may run past midnight; the Event belongs to its start day); exactly one Venue; Display name + Organizer; description; price as free text; optional link; the Flyer image, shown on the Event; cancelled flag; optional Series link; Tip origin.
- **No start time, no Event**: the bot asks the Organizer for the missing date/time and skips the Event without an answer (no "time TBA").
- **Intro class**: a Workshop bundled with a Party is not its own Event, but an optional Intro class start time on the Party. The "Workshop" filter also shows Parties with an Intro class.
- **Level**: Workshops only (so Courses too); free text copied from the Flyer; shown, never filtered (the level filter stays out of scope).
- **Festival**: one multi-day Event, no inner Events. Main Venue is its Venue; other venues go in the description.
- **Venue**: exactly one per Event; a name or handle without an address is matched to a known Venue or created with a confirmed address during confirmation.
- **Series**: stored as a rule (weekly, every N weeks, Nth weekday of the month), always confirmed by the Organizer in plain words ("every 2nd Wednesday of the month: 14.10, 11.11, 09.12"). Explicit listed dates override the rule. Generates real Events **12 weeks ahead**; each has its own edit link (changes/cancels only that occurrence). A **Series edit link** changes the rule or shared fields for future occurrences, or ends the Series. One-off edits survive Series edits. Ending a Series removes its future occurrences; a single cancelled occurrence stays visible and marked.
- **Series lifetime**: 12 weeks from the last sign of life (repost, edit, or "yes" to the bot's "still running?" asked 8 weeks after the last sign of life). No answer, the Series runs out. A reposted Flyer for the same Series (same Display name, Venue, rule) extends it; if anything differs the bot asks "update or new?". Tip Series: the Admin confirms the rule and gets the reminder. See [ADR 0001](../../../docs/adr/0001-series-end-by-themselves.md).
- **Course**: a Series of Workshops + "registration required". Different levels in the same slot are separate Courses.

Glossary updated: **Intro class** added, **Course** redefined.

- Amendment from "Legal requirements: Impressum, GDPR, WhatsApp policy": the Flyer image is shown only on Organizer Events; **Tip Events are shown without it** (extracted facts only). *Later overridden: Tip Flyers are shown too, see the legal ticket.* Past Events are deleted about 3 months after they happen.
