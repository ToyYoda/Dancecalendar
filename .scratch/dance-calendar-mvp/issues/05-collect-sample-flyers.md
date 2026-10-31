# Collect sample Flyers from Kassel/Göttingen

Type: task
Status: resolved
Labels: wayfinder:task

## Question

Gather a realistic test set before extraction and the confirmation flow are designed: 20–30 real Flyers (images and text posts) from the Kassel and Göttingen WhatsApp groups, covering Parties, Workshops, Courses and Festivals, single and multi-Event Flyers, Series ("every Friday"), German and English. Save them under `.scratch/dance-calendar-mvp/assets/flyers/` (not committed publicly if they contain personal data). HITL: the human collects them; the agent can sort and catalogue them.

## Answer

17 real Flyers collected (6–19 Oct 2026), all images, in `assets/flyers/` (git-ignored). Catalogue with per-Flyer ground truth and tricky cases: [flyer-catalogue.md](../assets/flyer-catalogue.md).

Key facts for later tickets:
- Workshops almost always come **bundled with a Party** on one Flyer (8 of 17); no pure Workshop Flyer.
- Series wording is ambiguous: "jeden 2./zweiten Mittwoch" (F02, F11) can mean every other or the 2nd of the month; one Series Flyer has no date at all (F02).
- Multi-Event Flyers exist (F06 three dates, F12 save-the-date, F16 four Events in two cities).
- The same Event arrives twice in updated form (F03 → F17): a real duplicate/edit case.
- Year is often missing or two-digit; addresses are often missing (venue name or Instagram handle only); one end time runs past midnight.
- Text mixes German, English and **Spanish**.
- 3 of 17 Flyers are from **outside Kassel/Göttingen** (Fulda, Gießen/Marburg), so they circulate in the same groups.
- Gaps: no text-only posts, no WCS/Urban Kiz, only 2 Göttingen Flyers, no in-region Course.
