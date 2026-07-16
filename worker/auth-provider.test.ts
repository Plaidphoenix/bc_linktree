import { describe, expect, it } from "vitest";
import app, { resolveAdminBaseUrl, type Bindings } from "./index";

const env: Bindings = {
  DB: {} as D1Database,
  ENVIRONMENT: "production",
  AUTH_PROVIDER: "access",
  APP_BASE_URL: "https://bc-linktree.pages.dev",
  ADMIN_BASE_URL: "https://api.example.workers.dev"
};

describe("Cloudflare Access authentication mode", () => {
  it("returns authenticated users to the Worker-hosted admin", () => {
    expect(resolveAdminBaseUrl("https://fallback.example/request", env)).toBe(
      "https://api.example.workers.dev"
    );
  });

  it("falls back to the public app origin when no admin origin is configured", () => {
    expect(
      resolveAdminBaseUrl("https://fallback.example/request", {
        APP_BASE_URL: "https://bc-linktree.pages.dev"
      })
    ).toBe("https://bc-linktree.pages.dev");
  });

  it("rejects local password login", async () => {
    const response = await app.request(
      "https://worker.example/api/auth/login",
      { method: "POST", body: JSON.stringify({ email: "user@example.com", password: "secret" }) },
      env
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/Access/i) });
  });

  it("explains that password recovery is handled without a local password", async () => {
    const response = await app.request(
      "https://worker.example/api/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email: "user@example.com" }) },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringMatching(/codigo temporario/i)
    });
  });

  it("rejects local reset tokens", async () => {
    const response = await app.request(
      "https://worker.example/api/auth/reset-password",
      { method: "POST", body: JSON.stringify({ token: "x".repeat(40), password: "long-password" }) },
      env
    );

    expect(response.status).toBe(409);
  });
});
