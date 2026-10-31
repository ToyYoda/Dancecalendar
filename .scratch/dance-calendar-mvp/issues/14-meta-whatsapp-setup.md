# Meta business portfolio and WhatsApp number setup

Type: task
Status: resolved
Labels: wayfinder:task

## Question

Can a private person set up what the bot needs, and how long does it take? Work through it with the human:
- a Meta business portfolio
- a WhatsApp Business Platform app
- a dedicated number (a prepaid SIM not already on WhatsApp)
- the bot's display name approval
- a payment method on file

Also confirm the primary text of Meta's Business AI policy (so far only a news source says task-specific bots stay allowed). Record what was created, where the credentials live (not their values), and any blockers. See "WhatsApp bot feasibility and cost" and "Legal requirements: Impressum, GDPR, WhatsApp policy".

## Answer

**Done, 2026-10-31. A private person can do it, with no company and no business verification, in about 35 minutes in the browser plus buying the SIM.**

- **What exists now:**
  - Meta developer account (the Admin's Facebook login)
  - business portfolio named "DanceCalendar"
  - app "DanceCalendar" (use case "Connect with customers through WhatsApp")
  - WhatsApp Business account
  - system user `dancecalendar-bot` with a non-expiring token
  - card on file
  - bot number **+49 1520 4333041**: Vodafone CallYa prepaid, `platform_type CLOUD_API`, `code_verification_status VERIFIED`, display name "DanceCalendar" with `name_status AVAILABLE_WITHOUT_REVIEW`, so no display-name review was needed.
- **Where the credentials live:** `.dev.vars` in the repo root (git-ignored; Wrangler reads it as Worker secrets in local dev). Keys: `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WABA_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_DISPLAY_PHONE`, `WHATSAPP_2FA_PIN` (the number's two-step PIN; the Worker doesn't need it, and the Admin also keeps it in their password manager). At deploy, put all except the PIN in with `wrangler secret put`. The physical SIM stays with the Admin and must not lapse, since re-verification needs it. Meta logins are the Admin's own.
- **Business AI policy:** confirmed from the primary text, § 4.7 of the Meta Terms for WhatsApp Business Platform (see Comments). A task-specific Flyer bot is allowed.
- **Stumbling blocks, all solved without verification:**
  - WhatsApp Manager refused access until the app was connected to a WhatsApp account.
  - The account form asks for a "registered" business name and a website. The portfolio is named DanceCalendar; the website entered is an interim one, to be replaced with the real domain at Deploy.
  - The direct System-users link said "expired"; go through Business Settings → Users → System users instead.
  - Pasting the wrong value into the wizard was fixed by re-running it.
- **Left for Deploy:**
  - set the webhook (callback URL + `WHATSAPP_VERIFY_TOKEN`, field `messages`)
  - put the app in Live mode (app icon, privacy-policy URL, data-deletion URL, EU data-protection contact)
  - replace the interim website
  - accept the Meta Business Data Processing Terms (legal checklist).
- **Wizard for a re-run** (new number, new token): [wizards/meta-whatsapp-setup.sh](../wizards/meta-whatsapp-setup.sh).

## Comments

**2026-10-31, agent (claimed):** AFK part done; waiting for the human to run the setup.

- **Business AI policy, primary text confirmed:** [Meta Terms for WhatsApp Business Platform](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform), § 4.7 "KI-Anbieter" (version dated 23 Sept 2026, read in the browser in German). It bars providers of LLMs, generative-AI platforms and general-purpose AI assistants when that AI is the *primary* functionality on offer ("die primäre Funktionalität (und nicht nur eine beiläufige oder Nebenfunktion)"), as Meta decides. Our bot uses AI only incidentally, to read Flyers, so it is allowed. The same section bars using Platform data to train AI models, except to fine-tune a model for your exclusive use; the AI provider's no-training term covers us. The Messaging Policy (updated 23 Sept 2026) adds only the escalation-path duty already in the legal ticket.
- **Setup wizard:** `bash .scratch/dance-calendar-mvp/wizards/meta-whatsapp-setup.sh`, run from the repo root. It covers 11 stages: SIM, developer account, app + portfolio, WhatsApp account, app secret, number + display name, system-user token, `/register` with a generated PIN, payment method, webhook verify token, status check. Values go to `.dev.vars` (git-ignored; Wrangler's local Worker secrets). Non-secret notes go to `wizards/meta-setup-log.md`.
- **Deferred to the Deploy ticket:** setting the webhook URL and putting the app in Live mode. Both need the deployed Worker. Publishing also needs an app icon (512–1024 px), a privacy-policy URL, a data-deletion URL, and an EU data-protection contact.
- **Not confirmed from the docs:** whether the portfolio form accepts a private person's name, the display-name review rules and duration, and the exact path to the payment method. The help-center pages loaded without their body text. The wizard logs what the human actually sees.

**2026-10-31, human running the wizard:** Problems found so far.
- WhatsApp Manager refused access ("Mit diesem Konto ist kein Zugriff auf den WhatsApp Manager möglich"). The app was not yet connected to a WhatsApp Business account, and API Setup only offered connecting an existing one or creating a new one.
- Creating the WhatsApp Business account asks for a **registered company name and a website**. The project has neither. Advised: use the Admin's full legal name as the business name, and for now a real interim URL: a Facebook/Instagram page or a placeholder page. Never use an invented URL. Switch to the real domain at Deploy.
