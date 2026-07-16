import { describe, expect, it } from "vitest";
import app, { isAllowedCorsOrigin, type Bindings } from "./index";

const OFFICIAL_FRONTEND = "https://public.example";
const OFFICIAL_ADMIN = "https://admin.example";

function env(environment: string): Bindings {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: environment,
    APP_BASE_URL: OFFICIAL_FRONTEND,
    ADMIN_BASE_URL: OFFICIAL_ADMIN
  };
}

describe("worker CORS policy", () => {
  it("allows loopback origins only in local development", async () => {
    expect(isAllowedCorsOrigin("http://localhost:5173", env("local"))).toBe(true);
    expect(isAllowedCorsOrigin("http://127.0.0.1:5173", env("development"))).toBe(true);
    expect(isAllowedCorsOrigin("http://localhost:5173", env("production"))).toBe(false);

    const response = await app.request(
      "https://worker.example/api/health",
      { headers: { Origin: "http://localhost:5173" } },
      env("local")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("allows the configured frontend origin in production", async () => {
    const response = await app.request(
      "https://worker.example/api/health",
      { headers: { Origin: OFFICIAL_FRONTEND } },
      env("production")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(OFFICIAL_FRONTEND);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("allows the same-origin Worker admin in production", async () => {
    const response = await app.request(
      "https://admin.example/api/health",
      { headers: { Origin: OFFICIAL_ADMIN } },
      env("production")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(OFFICIAL_ADMIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("rejects an unconfigured production origin", async () => {
    const response = await app.request(
      "https://worker.example/api/health",
      { headers: { Origin: "https://external.example" } },
      env("production")
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: "Origem nao autorizada." });
  });

  it("rejects preflight requests from origins outside the configured frontend", async () => {
    const response = await app.request(
      "https://worker.example/api/health",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://attacker.example",
          "Access-Control-Request-Method": "GET"
        }
      },
      env("production")
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("rejects a simple cross-origin state-changing request before authentication", async () => {
    const response = await app.request(
      "https://worker.example/api/auth/logout",
      {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "text/plain"
        },
        body: "{}"
      },
      env("production")
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("answers an allowed preflight with explicit CORS headers", async () => {
    const response = await app.request(
      "https://worker.example/api/admin/profile",
      {
        method: "OPTIONS",
        headers: {
          Origin: OFFICIAL_FRONTEND,
          "Access-Control-Request-Method": "PATCH",
          "Access-Control-Request-Headers": "Authorization,Content-Type"
        }
      },
      env("production")
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(OFFICIAL_FRONTEND);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(response.headers.get("access-control-max-age")).toBe("86400");
  });

  it("preserves legitimate requests without an Origin header", async () => {
    const response = await app.request("https://worker.example/api/health", undefined, env("production"));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
