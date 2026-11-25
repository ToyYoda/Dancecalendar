// Secrets that live only as Worker secrets (not in .dev.vars), so `wrangler types` can't see them.
// Email (src/mail.ts): BREVO_API_KEY and EMAIL_FROM send the email login's links and the Admin's daily
// email (which also needs ADMIN_EMAIL); until then both are off, the daily email with a warning.
// The operator's name, address and email for the legal pages (src/legal-pages.tsx) stay out of the public repo.
interface Env {
  ASSETS: Fetcher; // public/, also the page about Stepdate at /ueber
  ANTHROPIC_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string; // from @BotFather; the Telegram bot (src/telegram) is off without it
  GOOGLE_CLIENT_ID?: string; // "Mit Google anmelden" at /veranstalter (src/portal.tsx) shows only with both
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_SECRET: string; // /admin password until Cloudflare Access is set up at Deploy
  EMAIL?: SendEmail; // a send_email binding, once Cloudflare Email is set up on a domain
  BREVO_API_KEY?: string; // Brevo's transactional email API (ADR 0006)
  ADMIN_EMAIL?: string;
  EMAIL_FROM?: string;
  OPERATOR_NAME: string;
  OPERATOR_ADDRESS: string; // one line, comma-separated: "Street 1, 12345 Town"
  CONTACT_EMAIL: string;
}
declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    ANTHROPIC_API_KEY: string;
    TELEGRAM_BOT_TOKEN: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    ADMIN_SECRET: string;
    EMAIL?: SendEmail;
    BREVO_API_KEY?: string;
    ADMIN_EMAIL?: string;
    EMAIL_FROM?: string;
    OPERATOR_NAME: string;
    OPERATOR_ADDRESS: string;
    CONTACT_EMAIL: string;
  }
}
