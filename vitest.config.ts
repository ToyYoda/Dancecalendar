import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Test values only; they override anything in .dev.vars.
            PUBLIC_URL: "https://dancecalendar.test",
            WHATSAPP_APP_SECRET: "test-app-secret",
            WHATSAPP_VERIFY_TOKEN: "test-verify-token",
            WHATSAPP_ACCESS_TOKEN: "test-access-token",
            WHATSAPP_PHONE_NUMBER_ID: "1000",
            ANTHROPIC_API_KEY: "test-anthropic-key",
            ADMIN_SECRET: "test-admin-secret",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
