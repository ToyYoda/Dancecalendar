// Secrets that live only as Worker secrets (not in .dev.vars), so `wrangler types` can't see them.
interface Env {
  ANTHROPIC_API_KEY: string;
  ADMIN_SECRET: string; // /admin password until Cloudflare Access is set up at Deploy
}
declare namespace Cloudflare {
  interface Env {
    ANTHROPIC_API_KEY: string;
    ADMIN_SECRET: string;
  }
}
