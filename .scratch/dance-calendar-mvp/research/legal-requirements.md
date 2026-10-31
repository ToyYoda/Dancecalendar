# Legal requirements for the DanceCalendar MVP

Researched 2026-10-31 for ticket `issues/03-legal-requirements.md`.

> **This is not legal advice.** It is a research summary drawn from primary sources (law texts, official terms, regulator material) to scope the MVP. Where the law is unclear, this note picks the conservative option. Before launch, consider a short check by a lawyer or a free consultation (for example through a Verbraucherzentrale or IHK, or the data-protection authority's FAQ pages) for anything marked *uncertain*.

Setting: one private person (the Admin) runs a free, ad-free community calendar. Organizers and tippers send Flyers to a WhatsApp bot, an AI vision model extracts Events, and the Events are published on a public website. The Admin lives in Hesse (Kassel), which is assumed below. If not, swap in the competent authority.

---

## 1. Impressum (provider identification)

**Two separate rules, and the second one catches us.**

- **§ 5 DDG** (formerly § 5 TMG) applies only to "geschäftsmäßige, in der Regel gegen Entgelt angebotene digitale Dienste". It requires name, address, and fast electronic contact including an email address (§ 5 Abs. 1 Nr. 1–2). A free, ad-free hobby calendar is *probably* outside it, but this is *uncertain*: "geschäftsmäßig" is read broadly, and Organizers use the calendar to promote paid Events. Source: https://www.gesetze-im-internet.de/ddg/__5.html
- **§ 18 Abs. 1 MStV** (Medienstaatsvertrag, version in force since 01.12.2025) applies to *all* telemedia that do not serve "ausschließlich persönlichen oder familiären Zwecken". A public calendar for a regional scene is clearly not purely personal, so the provider must keep **name and address** "leicht erkennbar, unmittelbar erreichbar und ständig verfügbar". Source: https://www.gesetze-bayern.de/Content/Document/MStV-18
- **§ 18 Abs. 2 MStV:** offers with *journalistic-editorial* content must also name a responsible person with name and address. An event listing that is AI-extracted from Flyers is probably not journalistic-editorial (*uncertain*). Naming the Admin as "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV" costs nothing, so do it.
- Regulator guidance (Landesanstalt für Medien NRW, "Infos kompakt Impressumspflicht"):
  - Give the full first and last name and a **ladungsfähige Anschrift** (an address where court papers can be served: street, number, postcode, town). **A PO box is not enough.**
  - Only sites that serve purely personal or family purposes, for example password-protected for friends, are certainly exempt.
  - The guide recommends an Impressum on private sites as well.

  Source: https://www.medienanstalt-nrw.de/fileadmin/user_upload/lfm-nrw/Regulierung/Beschwerde/Infos_kompakt/Infos_kompakt-Impressumspflicht.pdf
  - Note: the guide predates the MStV and cites the old § 55 RStV, which became § 18 MStV with the same wording.

**Result:** publish an Impressum with the following, reachable in one click from every page (footer link "Impressum"):

- full name
- a servable postal address
- an email address
- the "Verantwortlich nach § 18 Abs. 2 MStV" line

If the Admin does not want to publish the home address, the usual workarounds are a business-address or c/o service. Whether such an address counts as servable is disputed between courts (*uncertain*), so treat it as a residual risk.

## 2. Data protection (DSGVO/GDPR, BDSG, TDDDG)

### 2.1 Does the GDPR apply at all?
Yes. The household exemption (Art. 2(2)(c) GDPR, "purely personal or household activity") does not cover publishing personal data to an indefinite public on the internet (CJEU C‑101/01 *Lindqvist*, para. 47). It also does not cover running a service for third parties. **The Admin is the controller (Art. 4(7)).** GDPR text: https://eur-lex.europa.eu/eli/reg/2016/679/oj

### 2.2 What personal data the MVP processes, and on which legal basis

| Data | People | Legal basis (Art. 6(1)) | Suggested retention |
|---|---|---|---|
| WhatsApp number, WhatsApp profile name, Display name, chat messages | Organizers | (b) performing the user relationship under the Terms of Use they accept when applying or using an invite | While registered, plus up to 3 months after leaving or being removed |
| WhatsApp number, messages, the answer to "Is this your event?" | Tippers and other unregistered senders | (f) legitimate interest in running the calendar and processing the Tip | Delete Tip-related messages and the number after the Tip is reviewed, at most 30 days. Keep the remembered "No" answer only as a hash, or delete it after 6–12 months of inactivity |
| Flyer images and text, extracted Event data (may include names and photos of teachers/DJs) | People named or shown on Flyers | (f) legitimate interest in publishing publicly announced events. The Organizer has already chosen to make the info public | While the Event is shown, plus a short archive period (e.g. 3 months after the Event). Original uploads that are not published: delete after extraction or review |
| Server and access logs (IP, user agent) | Dancers (website visitors) | (f) security and operation | 7–14 days |
| Edit-link tokens | Organizers | (b) | Until the Event expires |

- Dancers have no accounts and filters live in the URL, so the site can avoid storing anything on visitors' devices.
- Storing or reading information on a device needs consent unless strictly necessary (**§ 25 TDDDG**: https://www.gesetze-im-internet.de/ttdsg/__25.html).
- With **no analytics, no tracking cookies, and no third-party embeds**, there is **no cookie banner** to build.
- Self-host fonts and map tiles, or proxy them. Loading Google Fonts from Google's servers leaks visitor IPs to Google; LG München I, 20.01.2022, 3 O 17493/20, awarded damages for exactly this.
- Map embeds such as OpenStreetMap tiles from third-party servers transmit IPs. Either self-host or proxy them, or load them only after a click.

### 2.3 Privacy policy (Datenschutzerklärung): required contents
Art. 13 GDPR (data collected from the person) and Art. 14 (data obtained elsewhere, e.g. teacher/DJ names from Flyers) require:

- controller identity and contact (the Admin)
- purposes and legal basis for each processing activity (one section each: website/logs, WhatsApp bot, Organizer accounts, Tips, publication of Events, AI extraction)
- the legitimate interests relied on for (f)
- recipients and processors (hosting, AI provider, WhatsApp/Meta, email provider)
- third-country transfers and the safeguard used
- retention periods
- rights: access, rectification, erasure, restriction, portability, **objection (Art. 21, must be highlighted separately)**, withdrawal of consent if consent is used anywhere
- the right to complain to a supervisory authority: in Hesse, **Der Hessische Beauftragte für Datenschutz und Informationsfreiheit (HBDI)**
- whether providing the data is required, and that no automated decision-making with legal effect takes place (Art. 22). Admin approval is human.

For people named on Flyers (Art. 14), direct notification would take disproportionate effort (Art. 14(5)(b)). Publishing the information in the privacy policy, plus an easy removal and objection route ("Are you named on an Event and want it removed? Write to …"), is the standard practice.

The WhatsApp Business Messaging Policy also *contractually* requires "a published privacy policy" (see § 4).

### 2.4 Processors and data processing agreements (Art. 28)
Every provider that processes personal data on the Admin's behalf needs an Art. 28 contract (Auftragsverarbeitungsvertrag, AVV/DPA). With the big providers this is a click-through or is incorporated into the terms. Download and file a copy.

- **Hosting** (web server, database, file storage): use an EU provider with a standard DPA.
- **AI vision model:** a DPA is needed, and the provider must not use the data to train its models.
  - Prefer API terms with no training on customer data and short retention, and an EU data region if offered.
  - Flyers can contain faces and names, so this is a real processor relationship, not an incidental one.
- **WhatsApp (Meta)**, via the Cloud API: the *WhatsApp Business Data Processing Terms* (last updated 22.08.2025) apply where WhatsApp processes Customer Data as the business's processor.
  - They cover instructions, confidentiality, security, breach notification, assistance, and deletion at termination.
  - Sub-processors may be in the EEA or US.
  - Transfers run through the *WhatsApp Business Data Transfer Addendum* when WhatsApp Ireland Ltd is the contracting party.
  - Source: https://www.whatsapp.com/legal/business-data-processing-terms/
  - Meta also processes some metadata as an independent controller. Mention this in the privacy policy and link Meta's/WhatsApp's privacy policy.
- **Transactional email** (if used for edit links or Admin mail): needs a DPA.

### 2.5 Transfers outside the EU (Chapter V, Art. 44 ff.)

- **US providers:** the **EU‑US Data Privacy Framework** adequacy decision (Commission Implementing Decision (EU) 2023/1795) is in force.
  - The EU General Court upheld it on 03.09.2025 (T‑553/23 *Latombe*). An appeal is pending at the CJEU (C‑703/25 P). I could not confirm its outcome from a primary source as of 2026‑10‑31 (*check curia.europa.eu before launch*).
  - Transfers to a US provider are lawful if the recipient is **certified under the DPF** (check https://www.dataprivacyframework.gov/list). Otherwise the provider's Standard Contractual Clauses must be in its DPA.
- If the DPF falls, providers usually fall back to SCCs, which are normally already in their DPAs.
- Lowest-risk option: EU hosting, plus an AI provider with an EU region or a DPF certification and SCCs.

### 2.6 Other GDPR duties at this scale
- **Records of processing (Art. 30):** the < 250-employee exemption (Art. 30(5)) does not apply to processing that is "not occasional", and this processing is continuous. Keep a one-page record listing the processing activities, data categories, recipients, retention, and TOMs (technical and organisational measures). The privacy-policy table above is most of it.
- **Data Protection Officer:** not required. § 38 Abs. 1 BDSG applies from 20 persons regularly processing data (https://www.gesetze-im-internet.de/bdsg_2018/__38.html), and Art. 37 GDPR does not apply (no large-scale special-category data or systematic monitoring).
- **Security (Art. 32):**
  - HTTPS
  - edit links with long random tokens
  - an Admin login with a strong password and 2FA
  - minimal stored data
  - backups
  - phone numbers never shown publicly
  - Tipper identity never shown publicly
- **Data breach (Art. 33/34):** report to the HBDI within 72 hours if a breach risks people's rights. Write a 5-line runbook.
- **Data subject requests:** answer within one month (Art. 12(3)). A contact email in the Impressum and privacy policy is enough.
- **Data minimisation:** don't store WhatsApp profile pictures. Don't keep raw chat logs longer than needed for extraction.

## 3. Publishing Flyer content

### 3.1 Copyright of Flyer images (UrhG)
- Flyer artwork and photos are protected as works (§ 2 UrhG) or at least as simple photographs (§ 72 UrhG, 50 years). Showing them on the website is "öffentliche Zugänglichmachung" (making available to the public online), which only the rights holder may allow (§ 19a UrhG). Source: https://www.gesetze-im-internet.de/urhg/
- **Facts are free.** Event title, date, time, Venue, style, and price are not copyrightable. Re-typing them is fine. Copying long descriptive texts verbatim may not be.
- **Organizer Flyers:** the Terms of Use, accepted when becoming an Organizer, should say that:
  - the Organizer holds the necessary rights to the Flyer, or has permission from the designer, photographer, and people shown;
  - the Organizer grants a simple, free, revocable licence to show the Flyer and its contents on DanceCalendar;
  - the Organizer indemnifies the Admin against claims. A private individual's indemnity is of limited practical value, but it makes the allocation of responsibility clear.
- **Tip Flyers** are the risk: the tipper usually holds no rights.
  - The BGH's "schlichte Einwilligung" (implied consent) line (BGH I ZR 69/08 *Vorschaubilder I*, 29.04.2010; I ZR 140/10 *Vorschaubilder II*) concerns search-engine thumbnails of images published openly on the web. Whether it extends to re-posting a Flyer shared in WhatsApp groups is *uncertain* and should not be relied on.
  - **Recommendation:** for Tip Events, show only the extracted facts plus "added by the community" and do not publish the Flyer image. Alternatively, show the image only after the Admin has the Organizer's OK.
  - In all cases, provide a fast takedown route. As a host of third-party content, liability generally starts once you know about an infringement and fail to act; see the hosting privilege in Art. 6 DSA.
- **Photos of people on Flyers (§ 22 KUG, right to one's own image):** a person who poses for promotional Flyers of an event has normally consented to that promotional use. The Organizer's warranty covers this. Remove on request.

### 3.2 Names of teachers/DJs on Events
These are personal data (§ 2.2). The legal basis is Art. 6(1)(f): the names were published by the Organizer to promote a public event, and listing them for the same purpose is expected. Duties:

- Cover this in the privacy policy (Art. 14 information).
- Honour objections (Art. 21) promptly by removing the name or the Event.
- Don't build per-person pages or search across people. That would be profiling beyond the original purpose.

### 3.3 Digital Services Act (Regulation (EU) 2022/2065)
The DSA applies to "information society services", meaning services "normally provided for remuneration" (Art. 3(a) DSA, referring to Directive (EU) 2015/1535). A free, ad-free hobby service is *probably* outside it (*uncertain*). In any case, small and micro enterprises are exempt from most online-platform duties (Art. 19). The low-cost things worth doing anyway are:

- a contact point (the Impressum email, cf. Art. 11/12)
- a "report this Event" link or email for illegal content (cf. Art. 16)
- one paragraph in the Terms of Use on what gets removed and why (cf. Art. 14)

Source: https://eur-lex.europa.eu/eli/reg/2022/2065/oj

## 4. WhatsApp Business Platform constraints on the bot

Sources: the WhatsApp Business Messaging Policy (https://whatsappbusiness.com/policy/) and the Meta Terms for WhatsApp Business Platform (formerly the WhatsApp Business Solution Terms, https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform; the page could not be fetched as text, so the AI-provider clause is cited from consistent press reports, e.g. TechCrunch 18.10.2025, *verify in the console when signing up*).

- **AI-provider ban (effective for all accounts since 15.01.2026):**
  - The terms bar providers of LLMs, generative-AI platforms, and general-purpose AI assistants from using the Business Platform when that AI is the *primary* functionality offered. Meta decides in its sole discretion.
  - Bots that use AI *incidentally* for a specific business task (support, bookings, here: extracting Events from a Flyer) are allowed.
  - **Design consequence:** keep the bot single-purpose (Flyer in → Events out → confirm). Don't let it answer free-form questions; reply to anything else with a fixed help text.
- **Opt-in:** a business may message people only after they provided their number and opted in to receive messages. Opt-outs ("stop") must be honoured. Users who write to the bot first have initiated contact. Organizers' acceptance of the Terms covers follow-ups.
- **24-hour customer-service window:** free-form replies (including automated ones) are allowed only within 24 h of the user's last message. Outside that window only pre-approved **Message Templates** may be sent, and these may cost money. Example: telling an Organizer "your application was approved" days later needs a template, or should go by another channel such as the edit/apply link page.
- **Human escalation:** automated chats must offer "prompt, clear, and direct escalation paths", e.g. an "Admin: email …" line in the help text.
- **Data use:** data from a chat may be used only as reasonably necessary to support messaging with that person. Do **not** "forward or otherwise share information from a customer chat with any other customer". Publishing the *Event* is the purpose the sender asked for, but never expose a tipper's number or name, and never echo one user's messages to another.
- **Privacy policy:** the policy requires the business to obtain "all necessary notices, permissions, and consents" and to keep "a published privacy policy". Link it in the bot's first reply.
- **Content:** no prohibited content (adult content, weapons, etc.). Parties advertising alcohol are fine to *receive*, but the bot itself must not promote regulated goods.
- **Impersonation:** the business display name must not mislead, e.g. "DanceCalendar Kassel/Göttingen", not an Organizer's brand.
- **Account:** a Meta Business portfolio and a dedicated phone number for the Cloud API are needed. Meta reviews the display name. *Account set-up is out of scope for this ticket.*

## 5. EU AI Act: chatbot transparency

Art. 50(1) of Regulation (EU) 2024/1689 has applied since **02.08.2026**. Several sources confirm that the 2026 "Digital Omnibus" did not postpone it. Providers of AI systems that interact directly with people must make clear that the person is dealing with an AI, unless this is obvious. The bot uses an AI model, so state it in the first reply. One line costs nothing, e.g. "I'm an automated assistant; I use AI to read your Flyer. Please check the result." Source: https://eur-lex.europa.eu/eli/reg/2024/1689/oj

The AI provider's terms usually also require disclosing AI use and forbid sending certain data. Read the acceptable-use policy of the chosen model.

---

## Pre-launch checklist (MVP must have)

**Website pages**
- [ ] **Impressum** page, linked from every page footer:
  - [ ] full name
  - [ ] a servable postal address (no PO box)
  - [ ] an email address
  - [ ] "Verantwortlich nach § 18 Abs. 2 MStV: <name, address>"
- [ ] **Datenschutzerklärung** (privacy policy) in German, with an English version, linked from every page and from the bot's first reply. It covers:
  - [ ] controller
  - [ ] every processing activity with purpose, legal basis, and retention (table in § 2.2)
  - [ ] processors (hosting, AI, WhatsApp/Meta, email)
  - [ ] third-country transfers and safeguards
  - [ ] Art. 15–21 rights, with the Art. 21 objection highlighted
  - [ ] the complaint right to the HBDI
  - [ ] Art. 14 information for people named on Flyers
- [ ] **Terms of Use for Organizers** (shown and accepted on apply/invite):
  - [ ] rights warranty for Flyers and depicted people
  - [ ] simple licence to publish
  - [ ] removal policy
  - [ ] the Admin may edit or remove anything
- [ ] "Report / remove this Event" contact on each Event or in the footer.

**Website technology**
- [ ] No analytics, no tracking cookies, no third-party embeds, so no cookie banner (§ 25 TDDDG).
- [ ] Fonts self-hosted. Maps self-hosted, proxied, or click-to-load.
- [ ] HTTPS everywhere. Server logs auto-deleted after ≤ 14 days.
- [ ] Phone numbers and tipper identities never appear on the public site.

**Data handling**
- [ ] Retention jobs:
  - [ ] Tip messages and numbers deleted ≤ 30 days after review
  - [ ] unpublished Flyer uploads deleted after extraction or review
  - [ ] past Events and their images purged after ~3 months
  - [ ] Organizer data deleted ≤ 3 months after leaving
- [ ] Admin access protected (strong password and 2FA). Edit links use long random tokens.
- [ ] DPAs accepted and filed for hosting, AI provider, WhatsApp (Business Data Processing Terms), and the email provider.
- [ ] AI provider: no training on submitted data. EU region, or DPF-certified (checked on dataprivacyframework.gov), or SCCs in its DPA.
- [ ] One-page record of processing activities (Art. 30) and a 5-line data-breach runbook (72 h to the HBDI).
- [ ] Re-check the CJEU appeal C‑703/25 P (DPF) status at launch.

**Tips and Flyer content**
- [ ] Tip Events are published **without the Flyer image**, only extracted facts plus "added by the community", unless the Organizer has OK'd it.
- [ ] Teacher/DJ names are only shown on Events. No people pages or people search. Names are removed promptly on objection.

**WhatsApp bot**
- [ ] Single-purpose: Flyer → Events → confirm. Anything else gets a fixed help text, with no open-ended AI chat (AI-provider clause).
- [ ] First reply includes:
  - [ ] "automated assistant, uses AI" (AI Act Art. 50)
  - [ ] the privacy-policy link
  - [ ] how to reach the Admin (human escalation)
  - [ ] "send STOP to opt out"
- [ ] Free-form replies only inside the 24 h window. Later notices (e.g. "application approved") use an approved template or another channel.
- [ ] No content from one user's chat is shown to another user. Opt-outs are honoured and stored.
- [ ] The WhatsApp display name is "DanceCalendar …", not an Organizer's brand.

### Open questions
- Does § 5 DDG apply at all (non-commercial, but promoting paid events)? It is irrelevant in practice because § 18 MStV requires nearly the same Impressum. The only extra item under DDG is the email address, which is included anyway.
- Can a c/o or Impressum-service address replace the home address? Courts are split, so this needs a decision by the Admin.
- Exact current wording of Meta's AI-provider clause: read it in the Meta Business console at sign-up.
