import { describe, expect, it } from "vitest";
import headers from "../public/_headers?raw";
import packageJson from "../package.json?raw";
import viteConfig from "../vite.config.ts?raw";
import pagesBuild from "../scripts/build-pages.mjs?raw";
import pagesConfig from "../wrangler.jsonc?raw";
import workerConfig from "../wrangler.worker.jsonc?raw";
import seedAuthMigration from "../migrations/0004_disable_legacy_seed_auth.sql?raw";

describe("production security configuration", () => {
  it("publishes transport and content security headers", () => {
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
  });

  it("keeps production source maps disabled", () => {
    expect(viteConfig).toMatch(/sourcemap:\s*false/);
  });

  it("keeps local and production Worker deployment names distinct", () => {
    const config = JSON.parse(workerConfig);
    expect(config.name).not.toBe(config.env.production.name);
  });

  it("requires explicit Access build variables before a Pages deployment", () => {
    expect(packageJson).toContain('"deploy:web:production": "npm run build:web:production');
    expect(packageJson).toContain('"deploy:web:staging": "npm run build:web:staging');
    expect(pagesBuild).toContain('VITE_API_BASE_URL');
    expect(pagesBuild).toContain('VITE_AUTH_PROVIDER=access is required');
    expect(JSON.parse(pagesConfig).pages_build_output_dir).toBe("./dist");
  });

  it("disables legacy seed credentials and their sessions", () => {
    expect(seedAuthMigration).toContain("password_hash = 'LOCAL_AUTH_DISABLED'");
    expect(seedAuthMigration).toContain("DELETE FROM sessions");
    expect(seedAuthMigration).toContain("DELETE FROM password_resets");
  });
});
