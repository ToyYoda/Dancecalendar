---
name: DanceCalendar
description: The regional partner-dance week, set as a city magazine's "Termine" listings around each Organizer's whole Flyer.
colors:
  ink: "#111111"
  paper: "#ffffff"
  magenta: "#d6006d"
  magenta-ink: "#b0005a"
  mute: "#595959"
  hair: "#d4d4d4"
  dot: "#9a9a9a"
  wash: "#f3f3f1"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(34px, 10vw, 64px)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.035em"
  numeral:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "72px"
    fontWeight: 800
    lineHeight: 0.8
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 8vw, 56px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-long:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.6
  control:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
  label:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  none: "0px"
spacing:
  gutter: "16px"
  gutter-wide: "max(32px, calc((100vw - 1180px) / 2))"
  chip-gap: "6px"
  strip-gap: "18px"
  entry-gap: "14px"
  entry-gap-wide: "24px"
  flyer-measure: "360px"
components:
  type-tab:
    textColor: "{colors.mute}"
    typography: "{typography.control}"
    padding: "11px 0 9px"
  type-tab-active:
    textColor: "{colors.ink}"
  option-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
  option-chip-hover:
    backgroundColor: "{colors.wash}"
  option-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  view-switch-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "5px 10px"
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "9px 14px"
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "9px 14px"
  week-step:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    size: "34px"
  week-step-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  mark-cancelled:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    padding: "3px 6px 2px"
  menu:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "14px"
---

# Design System: DanceCalendar

## Overview

**Creative North Star: "The Termine Page"**

The Dancer page is set like the listings section of a printed city magazine: a heavy masthead on white stock, a 4px ink rule beneath it, giant day numerals that stay pinned while their Events scroll past, and entries run in a strict column with each Organizer's whole Flyer set inside it. Everything typographic is black ink; the colour on the page belongs to the Flyers, and one magenta does the pointing (today, the type of each Event, the filter that is set).

Density is a listings page's density: tight leading, rules instead of boxes, labels in tracked narrow capitals, numbers in tabular figures. Structure comes from line weight, not from surfaces: 4px ink for the masthead and footer, 1px ink between days and around controls, dotted grey hairlines between entries. Corners are square throughout. The world explicitly refuses the dark nightclub feed with neon glow and the rounded card grid of event apps.

This system currently covers the Dancer overview (week and month), the Event details page and `/karte`. The confirm page, edit page and admin surfaces still carry their own older styles and have not adopted it.

**Key Characteristics:**
- White stock, ink type, one magenta pointer.
- Rules, never cards: ink rules divide days, dotted hairlines divide entries.
- Giant Archivo 800 numerals pinned per day; Archivo Narrow 700 tracked caps for every label.
- The whole Flyer, uncropped and uncovered, inside each entry.
- Square corners; the only soft shadow belongs to an open menu.

## Colors

A monochrome print palette with a single saturated magenta; the Flyers supply all other colour.

### Primary
- **Listings Magenta** (#d6006d): marks today, and only today, wherever a day appears: the day index entry, the pinned numeral and its month name, the month cell numeral, the month event ticks, and the festival bar. Also text selection and the focus ring.
- **Deep Magenta Ink** (#b0005a): the text form of magenta, for small type: the Event type label (Party, Workshop, Course, Festival) in each entry and a filter menu whose value is set.

### Neutral
- **Press Ink** (#111111): all type, the masthead and footer rules, day rules, control outlines, and the solid fill of active choices (option chip, view switch, selected month cell, cancelled mark).
- **White Stock** (#ffffff): the page, sticky strips and pinned bands, menus.
- **Column Grey** (#595959): secondary text: the masthead subline, Organizer and notes lines, styles, counts, label captions.
- **Hairline Grey** (#d4d4d4): structural hairlines inside a strip (tab baseline, month grid, dotted index separators), inactive inline chip outlines, disabled week step.
- **Dot Grey** (#9a9a9a): the dotted rules between entries, under the phone numeral band and between fact rows.
- **Proof Wash** (#f3f3f1): hover fill for chips, index days and month cells; placeholder behind a loading Flyer.

### Named Rules
**The Today Rule.** Magenta means "today" or "this is the type / the set filter". It never decorates, never fills a surface, never tints a Flyer frame.

**The Ink Fill Rule.** A chosen option is shown by inverting to ink with white text, not by colouring it. Magenta is reserved for the pointer roles above.

## Typography

**Display Font:** Archivo (with system-ui, sans-serif), self-hosted at 400, 600, 800
**Label Font:** Archivo Narrow 700 (with Archivo, system-ui), self-hosted

**Character:** A grotesque at two extremes: 800 tightly tracked for the masthead, numerals and titles, plain 400 for reading text, and a condensed bold caps voice for every label, like a magazine's listing furniture.

### Hierarchy
- **Display** (800, clamp(34px, 10vw, 64px), 84px from 960px, 0.86): the "Termine" masthead only.
- **Numeral** (800, 52px phone / 72px / 120px from 960px, 0.8): the pinned day numeral. Smaller siblings: day index numerals (800, 21px) and month cell numerals (800, 17px).
- **Headline** (800, clamp(30px, 8vw, 56px), 1, max 22ch, balanced): Event details title.
- **Title** (800, 20px, 26px from 960px, 1.15, balanced): Event title in a listing entry. Hover underlines it at 2px.
- **Body** (400, 15px, 1.45, tabular figures): running text; the time in the run-in line is 800 at 15px.
- **Body Long** (400, 15.5px, 1.6, max 65ch): the Event description on the details page.
- **Control** (600, 14.5px): type tabs, menu triggers, buttons; the active tab goes to 800.
- **Label** (Archivo Narrow 700, 10 to 13px, 0.08em, uppercase): weekday names, month names, the week range, the masthead folio, the language link, fact captions, the Event type, status marks.

### Named Rules
**The Two-Voice Rule.** Headings and numerals are Archivo 800 with negative tracking; labels are Archivo Narrow 700 caps with positive tracking. Never set a label in Archivo, never set a heading in Narrow.

**The Tabular Rule.** Figures are tabular everywhere, so times and day numbers align down the column.

## Layout

A single listings column with a page gutter of 16px, widening at 960px to at least 32px and centring the content in a 1180px measure. The masthead, then a sticky filter strip (types as a scrolling tab row, then place, styles and the Liste/Monat switch), then the week bar and an 8-day (or 7-day) index grid, then the days.

Each day is a two-column grid: the numeral column (78px, 150px from 960px) and the listings. The numeral is sticky under the filter strip. Below 600px the numeral collapses into a pinned horizontal band (numeral, weekday, month) above full-width entries, so a Flyer gets the whole phone width. From 960px each entry becomes a two-column grid: text on the left, the whole Flyer at a fixed 360px measure on the right, one entry per row.

Breakpoints: 600px (numeral column appears), 720px (styles show inline in the strip), 860px (details page splits Flyer 5fr / facts 4fr), 960px (wide gutter, 360px Flyer column, larger type). Spacing is tight and rule-led: 6px chip gaps, 18px strip gaps, 14px between entries (24px wide).

The month view is a 7-column ruled grid (54px cells, 84px from 960px) followed by the selected day set as a normal day.

### Named Rules
**The Pinned Day Rule.** Every day's numeral stays visible while its Events scroll: beside them from 600px, as a band above them on a phone.

**The Whole Flyer Rule.** A Flyer is never cropped, overlaid or covered by UI. It scales to fit (max 82vh in a phone column, full 360px column on desktop, full width on details).

## Elevation & Depth

Flat. Depth is expressed by line weight and by sticky layering against white stock, not by shadows. The single shadow is on an open filter menu, which sits above the listings and needs to read as lifted.

### Shadow Vocabulary
- **Open Menu** (`box-shadow: 0 14px 30px rgba(17,17,17,.14)`): the Ort/Tanzstil menu panel only, together with a 1.5px ink border.

### Named Rules
**The Flat Stock Rule.** Surfaces are flat white. A shadow appears only on an open menu. (The 4px inset magenta bar on a selected today cell in the month grid is a rule drawn with box-shadow, not elevation.)

## Shapes

Square corners everywhere (0px). Form comes from rules: 4px ink (masthead base, footer top), 1px ink (day separators, filter strip base, control outlines, the map frame), 1px hairline grey (in-strip baselines, month grid), dotted grey (between entries, the phone numeral band, fact rows). Month ticks are 7px squares. Icons are thin inline SVG strokes (1.6px chevrons and arrows), never glyphs.

## Components

### Type Tabs
Text tabs on a hairline baseline. Inactive Column Grey at 600; hover goes to ink; active is ink at 800 with a 3px ink underline sitting on the baseline. The row scrolls horizontally on a phone with no scrollbar.

### Option Chips
- **Style:** square, 1px ink outline, 600 at 13.5px, 6px 10px padding.
- **State:** hover fills Proof Wash; selected inverts to ink with white text. Inline in the strip (from 720px) they shrink to 4px 9px at 13px with a hairline outline, ink outline when selected.

### Menus
A `details` trigger (600, 14.5px, thin SVG chevron that rotates 180 degrees on open over .2s cubic-bezier(.2,.7,.2,1)). A set value turns the trigger Deep Magenta Ink. The panel is white, 1.5px ink border, 14px padding, max 440px, with the Open Menu shadow; option groups are divided by a dotted hairline.

### View Switch
A segmented pair (Liste / Monat) in a 1px ink outline; the active half is solid ink with white text.

### Buttons
- **Shape:** square (0px), 1px ink outline.
- **Default:** white with ink text, 600 at 14.5px, 9px 14px.
- **Solid:** ink fill, white text.
- **Disabled:** 35% opacity.
- **Week steps:** 34px square outlined buttons holding an SVG arrow; hover inverts to ink; the unavailable step goes hairline grey.

### Day Index
An 8-column (or 7) ruled grid between two 1px ink rules, cells divided by dotted hairlines: weekday label, 21px 800 numeral, count. Today is magenta; hover fills Proof Wash.

### Listing Entry (signature)
Title (Title role), then a run-in line: time in 800, Event type in Deep Magenta Ink caps, styles in grey, then Venue and distance after a "· ". Then one grey line of Organizer and notes, status marks, and the whole Flyer. Entries are divided by dotted grey rules.
- **Cancelled:** title struck through at 2px, a solid ink "abgesagt" mark, Flyer greyscale at 45% opacity.
- **Registration mark:** 1px ink outlined caps tag.
- **Tip:** italic grey 12.5px Archivo line "von der Community hinzugefügt", no box.
- **No Flyer:** a 120px dashed hairline placeholder.

### Pinned Day Numeral (signature)
The giant numeral with weekday and month in Narrow caps; magenta when the day is today. Sticky under the filter strip.

### Month Cell
Ruled cell with a 17px 800 numeral and 7px magenta ticks per Event (grey for cancelled). Selected inverts to ink; a festival runs as a 4px magenta bar at 45% along the cell base.

### Footer
Grey 12.5px text under a 4px ink rule, links in ink with a hairline underline.

## Do's and Don'ts

### Do:
- **Do** set every label, weekday and status in Archivo Narrow 700 uppercase at 0.08em tracking.
- **Do** divide days with 1px ink rules and entries with dotted Dot Grey rules; open and close the page with 4px ink rules.
- **Do** show a chosen option by inverting to ink (#111111) with white text.
- **Do** use Deep Magenta Ink (#b0005a) when magenta is small text, and Listings Magenta (#d6006d) for numerals, ticks, focus and selection.
- **Do** show the whole Flyer in every entry, scaled to fit, with nothing over it.
- **Do** keep icons as thin inline SVG strokes in currentColor.

### Don't:
- **Don't** round corners or put Events in cards; the listing is ruled, not boxed.
- **Don't** add shadows outside an open menu.
- **Don't** use magenta for anything except today, the Event type, the set filter, focus and selection.
- **Don't** introduce a dark theme, glow or neon; the stock is white.
- **Don't** crop, overlay or tint a Flyer, except the greyscale-and-fade that marks a cancelled Event.
