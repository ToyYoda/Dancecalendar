# Legal requirements: Impressum, GDPR, WhatsApp policy

Type: research
Status: resolved
Labels: wayfinder:research

## Question

What does a private individual in Germany need to run this non-commercial community calendar legally? Cover: Impressum duty (DDG, formerly TMG § 5) for a free community site; GDPR/DSGVO duties when storing Organizers' and tippers' phone numbers and names (legal basis, privacy policy contents, retention, data processing agreements with hosting/AI/WhatsApp providers, data transfers outside the EU); publishing Flyer contents and images (copyright of Flyer images, names of teachers/DJs on Events); and WhatsApp Business policy constraints on bots. Produce a checklist of what the MVP must have before launch. Not legal advice.

## Answer

Not legal advice. Full findings, sources and pre-launch checklist: [research/legal-requirements.md](../research/legal-requirements.md).

- **Impressum required.** § 18 Abs. 1 MStV applies to any site that is not purely personal, even a free one. It needs the full name, a servable postal address (no PO box) and an email. Add a "Verantwortlich nach § 18 Abs. 2 MStV" line. § 5 DDG probably doesn't apply (non-commercial) but adds nothing beyond this.
- **The GDPR applies, with the Admin as controller.** The household exemption doesn't cover a public site.
  - Legal bases: Art. 6(1)(b) for Organizers (via Terms of Use); 6(1)(f) for tippers, teacher/DJ names on Flyers and server logs.
  - Retention: delete Tip data within 30 days, past Events after about 3 months, logs within 14 days.
- **Paperwork.** A privacy policy meeting Art. 13/14, with the objection right highlighted and the complaint authority (HBDI) named. DPAs filed for hosting, the AI provider (no training on our data) and WhatsApp (Meta Business Data Processing Terms). US transfers are covered only via DPF certification or SCCs. A one-page Art. 30 record. No DPO needed.
- **No cookie banner** as long as there is no analytics or tracking and fonts and maps are self-hosted or proxied (§ 25 TDDDG).
- **Flyers.** Organizers warrant their rights and grant a licence in the Terms of Use. Tip Events are published with the extracted facts only, without the Flyer image. Provide a takedown/report contact.
- **WhatsApp bot.** It must stay single-purpose: Meta has banned general-purpose AI assistants since 15.01.2026. Its first reply includes:
  - an AI disclosure (AI Act Art. 50, in force since 02.08.2026)
  - the privacy-policy link
  - a route to a human
  - STOP to opt out

  Free-form replies are only allowed within the 24-hour window; anything later needs a template.

## Comments

- 2026-10-31, overridden while working "Dancer overview and filters": the human chose to **show the Flyer image on Tip Events too**, and take it down on request through the takedown contact. This is a consciously accepted risk: a Dancer who forwards someone else's Flyer cannot grant the rights to it, so the Admin is exposed if the designer or a person pictured complains. The takedown contact on the pre-launch checklist becomes mandatory.
