// Secrets that live only as Worker secrets (not in .dev.vars), so `wrangler types` can't see them.
// The Admin's daily email (src/admin-email.ts) needs all three; until then it's skipped with a warning.
interface Env {
  ANTHROPIC_API_KEY: string;
  ADMIN_SECRET: string; // /admin password until Cloudflare Access is set up at Deploy
  EMAIL?: SendEmail; // a send_email binding, once Cloudflare Email is set up on a domain
  ADMIN_EMAIL?: string;
  EMAIL_FROM?: string;
}
declare namespace Cloudflare {
  interface Env {
    ANTHROPIC_API_KEY: string;
    ADMIN_SECRET: string;
    EMAIL?: SendEmail;
    ADMIN_EMAIL?: string;
    EMAIL_FROM?: string;
  }
}
