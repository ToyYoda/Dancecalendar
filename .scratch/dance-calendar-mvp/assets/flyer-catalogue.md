# Sample Flyer catalogue

17 real Flyers collected from the community WhatsApp groups, 6–19 Oct 2026. Files live in `flyers/` (git-ignored: faces, names, an e-mail address). IDs below follow file order (timestamp in the filename).

"Events" is a hand reading of how many dated Events a Dancer would expect to see. It is the ground truth for checking extraction later, and it depends on how the Event data model ends up treating the cases flagged here.

| ID | File (`WhatsApp Image 2026-…`) | What | City | Lang | Events | Tricky bits |
|---|---|---|---|---|---|---|
| F01 | `10-06 at 12.01.34` | "Está pa Latin Party", Startup Bar | Kassel | DE/ES/EN | 1 Party (Fr 09.10.2026, from 22:00) | Instagram-story screenshot with UI noise ("Nachricht senden", reactions); no address, only `@startupbarkassel`; reggaeton-led club night, is it partner dance? |
| F02 | `10-07 at 08.12.27` | "Sensual Bachata Wednesday", Kater Bar | ? | EN/DE | Series, **no date at all** | "jeden 2. Mittwoch": every other Wednesday or 2nd Wednesday of the month?; no address, no city; class 20:00 + party 20:30 in one |
| F03 | `10-08 at 11.47.03` | "La Noche de la Salsa", Los Muchachos | Kassel | EN/ES | 1 Party with a Workshop (24 Oct, 20:00) | **Earlier version of F17**: same Event, English, other venue logo (ACT 1848); no year; footwork 20:30 + party 21:00; 5 € |
| F04 | `10-08 at 20.21.48` | "Brazilian Party", Tayas Bar & Restaurant | Göttingen | EN | 1 Party (10.10.26, 22:30) | Two-digit year; "Brazilian": partner dance or not?; free entry |
| F05 | `10-09 at 10.01.25` | Latin Musicality Festival | Kassel | DE/EN | 1 Festival (9–11 Oct 2026) | **Festival**; two venues (Kulturzentrum Schlachthof + Philipp-Scheidemann-Haus), no addresses, no times, no inner schedule; 9 teacher couples + 5 DJs; ticket URL + QR code |
| F06 | `10-09 at 10.02.00` | "Salsa Disco", Kulturzentrum Schlachthof | Kassel | DE/ES | Series: 3 dates listed (10.10.2026 21:30, 14.11., 12.12.) | Explicit **Series** rule ("jeden 2. Samstag im Monat") *and* listed dates; times only on the first; venue name only |
| F07 | `10-11 at 19.02.59` | "La Clave", Tanzschule Seyler | Kassel | DE | 1 Party with a Workshop (Fr 16.10., workshop 21:15–22:00) | Series rule "jeden 3. Freitag im Monat"; no year; **party start not stated**; two floors with different styles (Bachata/Salsa upstairs, Kizomba downstairs); raffle; 10 € / students 5 € |
| F08 | `10-12 at 14.49.13` | "The Last Dance – Latin Afterwork", Mea Mea Lounge | **Fulda** | DE/EN | 1 Party (12 Oct, 20:00) | **Outside Kassel/Göttingen**; final edition of a Series ("Danke an euch alle"); no year |
| F09 | `10-13 at 07.49.39` | "Latin Dance After Work", Startup Bar | Kassel | DE/EN | 1 Party with a Workshop (Do 15.10.2026; class 19:30, music 20:30) | Free open class "Latin Fusion" + party; styles include Reggaeton, R&B |
| F10 | `10-14 at 09.07.01` | "Sabakizz – Ritmo de la noche", Tanzschule Tango Zero | Kassel | DE/EN/ES | 1 Party (Sa 17.10.2026, 21:30–2:00) | End time **past midnight**; guest DJ; 10 € / reduced 5 €; e-mail address on the Flyer |
| F11 | `10-14 at 18.03.26` | "Salsa en Sótano", Nörgelbuff | Göttingen | DE/**ES** | 1 Party (14.10, 21:00), part of a Series | "Jeden zweiten Mittwoch" (same ambiguity as F02); no year; a full Spanish text block; free with Kulturticket, else 5 € |
| F12 | `10-16 at 08.45.12` | "Latin Social", Kulturzentrum Färberei | Kassel | DE | 1 Party with a Workshop (07 Nov, 20:30) + save-the-date 05.12 (Weihnachtsfeier) | No year; **second, vaguer Event** (date only); free beginner class 20:30 + party 21:30; "ab 5,-*" with footnote prices |
| F13 | `10-16 at 13.14.54` | "infinito Bachata-Party", Antonius-Café | **Fulda** | DE | 1 Party with a Workshop (18.10.2026, workshop 17:00, party 17:45) | **Outside the region**; afternoon party |
| F14 | `10-18 at 12.49.01` | "Latin Afternoon" | Kassel | DE | 1 Party with a Workshop (So 18.10.2026; taster class 16–17, social 17–19:30) | Address but **no venue name** ("Gegenüber dem Bahnhof Wilhelmshöhe"); open air if the weather is good |
| F15 | `10-18 at 14.22.19` | "Kirche und Salsa – geht das?" | Kassel | DE | 1 Party (23.10.26, 19–21) | Church service followed by dancing; address only, no venue name; two-digit year; not from a regular Organizer |
| F16 | `10-18 at 21.57.35` | "Salsa Events mit DJ Clayton" | **Gießen / Marburg** | DE | **4 Events**: Gießen courses (Mo 19.10.), Marburg courses (Di 20.10.), Marburg party (Di 20.10., 21–00), Gießen party (Fr 23.10., taster 20:30–21:15) | **Outside the region**; Courses with levels (Anfänger/Mittelstufe) and required registration; two cities on one Flyer; Venue for the courses not stated |
| F17 | `10-19 at 09.23.12` | "La Noche de la Salsa", Gaststätte AC Theke | Kassel | DE/ES | 1 Party with a Workshop (24. Oktober, 20:00) | **Updated version of F03**: same date/address, German text, venue logo changed. The duplicate warning and the edit link must handle this |

## Coverage

- **Types**: Parties 16 of 17 Flyers. Festival 1 (F05). Courses only on F16 (outside the region). No pure Workshop Flyer: every Workshop comes **bundled with a Party** (F02, F03/F17, F07, F09, F12, F13, F14, F16).
- **Series**: F02, F06, F07, F11, F08 (ending). Two say "jeden 2./zweiten Mittwoch", which can mean every other or the 2nd of the month.
- **Multi-Event Flyers**: F06 (3 dates), F12 (main + save-the-date), F16 (4 Events, 2 cities).
- **Cities**: Kassel 11, Göttingen 2, Fulda 2, Gießen/Marburg 1, unknown 1 (F02).
- **Languages**: German, English and **Spanish** (F03, F11, F17 and taglines elsewhere). Usually mixed on one Flyer.
- **Styles seen**: Salsa, Bachata (incl. "Sensual"), Kizomba, Merengue, Reggaeton, "Brazilian", "Latin Fusion", R&B. **No West Coast Swing or Urban Kiz.**
- **Formats**: all images; most are portrait story or poster graphics, two are app screenshots with UI noise (F01, F15). **No text-only posts.**

## Gaps in the sample

- 17 instead of 20–30; no text-only posts; no WCS or Urban Kiz; only 2 Göttingen Flyers; no Course inside the region.
- Worth topping up when the extraction is evaluated, but enough to design against now.
