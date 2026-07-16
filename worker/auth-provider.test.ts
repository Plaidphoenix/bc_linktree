import { describe, expect, it, vi } from "vitest";
import app, { resolveAdminBaseUrl, type Bindings } from "./index";

const accessEnv: Bindings = {
  DB: {} as D1Database,
  ENVIRONMENT: "production",
  AUTH_PROVIDER: "access",
  APP_BASE_URL: "https://public.example",
  ADMIN_BASE_URL: "https://admin.example"
};

describe("Cloudflare Access authentication mode", () => {
  it("returns authenticated users to the Worker-hosted admin", () => {
    expect(resolveAdminBaseUrl("https://fallback.example/request", accessEnv)).toBe(
      "https://admin.example"
    );
  });

  it("falls back to the public app origin when no admin origin is configured", () => {
    expect(
      resolveAdminBaseUrl("https://fallback.example/request", {
        APP_BASE_URL: "https://public.example"
      })
    ).toBe("https://public.example");
  });

  it("rejects local password login", async () => {
    const response = await app.request(
      "https://worker.example/api/auth/login",
      { method: "POST", body: JSON.stringify({ email: "user@example.com", password: "secret" }) },
      accessEnv
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/Access/i) });
  });

  it("explains that password recovery is handled without a local password", async () => {
    const response = await app.request(
      "https://worker.example/api/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email: "user@example.com" }) },
      accessEnv
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
      accessEnv
    );

    expect(response.status).toBe(409);
  });
});

describe("worker authentication provider isolation", () => {
  it("does not accept a local bearer session when Cloudflare Access is configured", async () => {
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          id: "usr_admin",
          name: "Synthetic Admin",
          email: "admin@example.invalid",
          username: "admin",
          role: "ADMIN",
          avatar: null,
          description: null,
          status: "active",
          active: 1
        }))
      }))
    }));

    const response = await app.request(
      "https://api.example.gov.br/api/auth/access",
      { headers: { Authorization: "Bearer test-token" } },
      {
        AUTH_PROVIDER: "access",
        ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
        ACCESS_AUD: "synthetic-audience",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not create local reset tokens when Cloudflare Access is configured", async () => {
    const prepare = vi.fn();

    const response = await app.request(
      "https://api.example.gov.br/api/auth/forgot-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "person@example.invalid" })
      },
      {
        AUTH_PROVIDER: "access",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(200);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns 401 instead of 500 for a malformed Cloudflare Access assertion", async () => {
    const prepare = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await app.request(
      "https://api.example.gov.br/api/auth/access",
      { headers: { "Cf-Access-Jwt-Assertion": "synthetic-malformed-assertion" } },
      {
        AUTH_PROVIDER: "access",
        ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
        ACCESS_AUD: "synthetic-audience",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("fails closed when production does not declare an authentication provider", async () => {
    const prepare = vi.fn();

    const response = await app.request(
      "https://api.example.gov.br/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.invalid", password: "synthetic-password" })
      },
      {
        ENVIRONMENT: "production",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(409);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("hashes a local bearer token before looking up the session", async () => {
    const token = "test-token";
    const first = vi.fn(async () => ({
      id: "usr_admin",
      name: "Synthetic Admin",
      email: "admin@example.invalid",
      username: "admin",
      role: "ADMIN",
      avatar: null,
      description: null,
      status: "active",
      active: 1
    }));
    const bind = vi.fn((..._args: unknown[]) => ({ first }));
    const prepare = vi.fn((_sql: string) => ({ bind }));

    const response = await app.request(
      "https://api.example.gov.br/api/auth/access",
      { headers: { Authorization: `Bearer ${token}` } },
      {
        ENVIRONMENT: "local",
        AUTH_PROVIDER: "local",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledOnce();
    expect(bind).not.toHaveBeenCalledWith(token);
    expect(bind.mock.calls[0][0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(prepare.mock.calls[0][0]).toContain("datetime(s.expires_at) > CURRENT_TIMESTAMP");
  });

  it("stores only a hash of a newly issued session token and does not audit the bearer secret", async () => {
    const password = "synthetic-password";
    const passwordHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const passwordHash = [...new Uint8Array(passwordHashBuffer)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const prepare = vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => {
        statements.push({ sql, args });
        return {
          first: async () =>
            sql.includes("FROM users")
              ? {
                  id: "usr_admin",
                  name: "Synthetic Admin",
                  email: "admin@example.invalid",
                  username: "admin",
                  role: "ADMIN",
                  avatar: null,
                  description: null,
                  status: "active",
                  active: 1,
                  password_hash: passwordHash
                }
              : null,
          run: async () => ({ success: true })
        };
      }
    }));

    const response = await app.request(
      "https://api.example.gov.br/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.invalid", password })
      },
      {
        ENVIRONMENT: "local",
        AUTH_PROVIDER: "local",
        DB: { prepare }
      }
    );
    const result = (await response.json()) as { token: string };
    const sessionInsert = statements.find((statement) => statement.sql.includes("INSERT INTO sessions"));
    const auditInsert = statements.find((statement) => statement.sql.includes("INSERT INTO audit_logs"));

    expect(response.status).toBe(200);
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionInsert?.args[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sessionInsert?.args[0]).not.toBe(result.token);
    expect(auditInsert?.args).not.toContain(result.token);
    expect(statements.flatMap((statement) => statement.args)).not.toContain(result.token);
  });

  it("normalizes ISO reset expiry values before comparing them with SQLite time", async () => {
    const statements: string[] = [];
    const prepare = vi.fn((sql: string) => {
      statements.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ success: true }))
        }))
      };
    });

    const response = await app.request(
      "https://api.example.gov.br/api/auth/reset-password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "synthetic-reset-token-with-32-characters", password: "synthetic-password" })
      },
      {
        ENVIRONMENT: "local",
        AUTH_PROVIDER: "local",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes("datetime(pr.expires_at) > CURRENT_TIMESTAMP"))).toBe(true);
  });
});
