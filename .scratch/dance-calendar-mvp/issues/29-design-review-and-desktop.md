# Design review and a desktop web view

Type: prototype
Labels: wayfinder:prototype

## Question

How should DanceCalendar look as a whole, and how should the Dancer overview use a desktop screen?

1. **Design review.** The pages were built slice by slice, each with its own inline CSS, and they now look related but not the same. Which shared look do they get? That means colours, type, spacing, header and footer, buttons, chips and cards. Which inconsistencies or rough spots should be fixed?
   - Dancer pages: the overview (`src/overview.tsx`) and the Event details.
   - Organizer pages: the confirm page, the edit page, the Series page, the apply form and the web upload (`src/confirm-page.tsx`, `edit-page.tsx`, `series-page.tsx`, `application.tsx`, `upload.tsx`, `event-card.tsx`).
   - The Admin upload and the legal pages (`admin.tsx`, `legal-pages.tsx`, `layout.tsx`).
2. **Desktop view of the overview.** Everything today is a phone column, at most about 40rem wide. On a laptop or desktop, how do these lay out?
   - The Flyer feed: several cards per row? A day per column?
   - The calendar: month grid and day list side by side?
   - The filters: a sidebar or the same top bar?
   - The Event details: a side panel or its own page?

   The URL filters must keep working unchanged, so a link opens the same view on a phone and on a desktop. Do the Organizer pages need a desktop layout at all, or is a centred column enough?

Make the prototype from the live pages with real sample Flyers (`assets/flyers/`), at phone and desktop widths, and react to it with the human. The outcome is the decided design plus the build ticket(s) that apply it.

## Comments

- From "Full Dancer overview" (2026-11-01): built mobile-first from variant D of [Dancer overview and filters](07-dancer-overview-prototype.md), with the sticky filter bar taking about a quarter of a phone screen. Worth a look in the review. On a desktop, the page is currently a narrow centred column.
