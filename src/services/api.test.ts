import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAIL, DEMO_PASSWORD, seedState } from "../data/seed";

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

  it("keeps the explicit local demo fallback available for network failures", async () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "local");
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("synthetic network failure"))));

    const { login, sessionStore } = await import("./api");
    const result = await login(DEMO_EMAIL, DEMO_PASSWORD);

    expect(result.user.email).toBe(DEMO_EMAIL);
    expect(sessionStore.getToken()).toMatch(/^demo_/);
  });

  it("does not enable demo fallback without an operator-supplied local password", async () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "local");
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "true");
    vi.stubEnv("VITE_DEMO_PASSWORD", "");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("synthetic network failure"))));

    const { login, sessionStore } = await import("./api");

    await expect(login(DEMO_EMAIL, "synthetic-password")).rejects.toMatchObject({ status: 0 });
    expect(sessionStore.getToken()).toBeNull();
  });

  it.each([401, 403, 409, 500])("does not use demo fallback for an HTTP %s response even in demo mode", async (status) => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "local");
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

describe("Cloudflare Access frontend URLs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds remote login and logout URLs without duplicate slashes", async () => {
    const { buildAccessUrl } = await import("./api");

    expect(buildAccessUrl("https://api.example.workers.dev/", "/api/auth/access/start")).toBe(
      "https://api.example.workers.dev/api/auth/access/start"
    );
    expect(buildAccessUrl("https://api.example.workers.dev", "/cdn-cgi/access/logout")).toBe(
      "https://api.example.workers.dev/cdn-cgi/access/logout"
    );
  });

  it("keeps same-origin paths relative for Worker-hosted assets", async () => {
    const { buildAccessUrl } = await import("./api");

    expect(buildAccessUrl(null, "/api/auth/access/start")).toBe("/api/auth/access/start");
  });
});

describe("authentication transport", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the Access cookie without forwarding a stale local bearer", async () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "access");
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ user: seedState.user, provider: "access" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessSession, sessionStore } = await import("./api");
    sessionStore.setToken("stale-local-bearer");
    await getAccessSession();

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(init?.credentials).toBe("include");
  });

  it("forwards the raw opaque bearer unchanged for local authentication", async () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "local");
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify(seedState), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getAdminState, sessionStore } = await import("./api");
    sessionStore.setToken("raw-opaque-bearer");
    await getAdminState();

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer raw-opaque-bearer");
  });
});
