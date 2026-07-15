import { describe, expect, it } from "vitest";
import app, { type Bindings } from "./index";

const env: Bindings = {
  DB: {} as D1Database,
  ENVIRONMENT: "production",
  AUTH_PROVIDER: "access",
  APP_BASE_URL: "https://bc-linktree.pages.dev"
};

describe("Cloudflare Access authentication mode", () => {
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
