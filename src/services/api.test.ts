import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../data/seed";

describe("API demo fallback boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not turn a rejected remote login into a demo admin session when fallback is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Credenciais invalidas." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const { login, sessionStore } = await import("./api");

    await expect(login(DEMO_EMAIL, DEMO_PASSWORD)).rejects.toMatchObject({ status: 401 });
    expect(sessionStore.getToken()).toBeNull();
  });

  it("keeps the explicit local demo fallback available for development", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("synthetic network failure"))));

    const { login, sessionStore } = await import("./api");
    const result = await login(DEMO_EMAIL, DEMO_PASSWORD);

    expect(result.user.email).toBe(DEMO_EMAIL);
    expect(sessionStore.getToken()).toMatch(/^demo_/);
  });

  it("does not enable demo fallback without an operator-supplied local password", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "true");
    vi.stubEnv("VITE_DEMO_PASSWORD", "");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("synthetic network failure"))));

    const { login, sessionStore } = await import("./api");

    await expect(login(DEMO_EMAIL, "synthetic-password")).rejects.toMatchObject({ status: 0 });
    expect(sessionStore.getToken()).toBeNull();
  });

  it.each([401, 403, 409])("does not use demo fallback for an HTTP %s response even in demo mode", async (status) => {
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Synthetic API rejection." }), {
          status,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const { login, sessionStore } = await import("./api");

    await expect(login(DEMO_EMAIL, DEMO_PASSWORD)).rejects.toMatchObject({ status });
    expect(sessionStore.getToken()).toBeNull();
  });

  it("accepts only HTTP(S) link targets", async () => {
    const { isSafeHttpUrl } = await import("./api");

    expect(isSafeHttpUrl("https://example.gov.br/service")).toBe(true);
    expect(isSafeHttpUrl("http://localhost:5173/example")).toBe(true);
    expect(isSafeHttpUrl("javascript:synthetic-payload")).toBe(false);
    expect(isSafeHttpUrl("data:text/plain,synthetic")).toBe(false);
    expect(isSafeHttpUrl("not a URL")).toBe(false);
  });
});
