import { afterEach, describe, expect, it, vi } from "vitest";
import app, { type Bindings } from "./index";

const syntheticJwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ ref_cod_usuario: 123 })).toString("base64url"),
  "synthetic-signature"
].join(".");

function fakeDatabase(userFound = true) {
  const sessionValues: unknown[][] = [];
  const deletedSessions: unknown[][] = [];

  const database = {
    prepare(sql: string) {
      return {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        async first() {
          if (sql.includes("FROM sessions s")) {
            return {
              id: "usr_synthetic",
              name: "Usuario Sintetico",
              email: "synthetic@example.test",
              username: "synthetic",
              role: "ADMIN",
              avatar: null,
              description: null,
              status: "active",
              active: 1,
              provider: "sim",
              provider_token: "invalid-encrypted-token"
            };
          }
          if (sql.includes("FROM users") && sql.includes("external_subject")) {
            return userFound
              ? {
                  id: "usr_synthetic",
                  name: "Usuario Sintetico",
                  email: "synthetic@example.test",
                  username: "synthetic",
                  role: "ADMIN",
                  avatar: null,
                  description: null,
                  status: "active",
                  active: 1,
                  external_subject: "123"
                }
              : null;
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO sessions")) {
            sessionValues.push(this.values);
          }
          if (sql.includes("DELETE FROM sessions")) {
            deletedSessions.push(this.values);
          }
          return { success: true, results: [], meta: { changes: 1 } };
        }
      };
    }
  };

  return { database: database as unknown as D1Database, sessionValues, deletedSessions };
}

function environment(database: D1Database): Bindings {
  return {
    DB: database,
    ENVIRONMENT: "production",
    AUTH_PROVIDER: "sim",
    APP_BASE_URL: "https://links.example.test",
    SIM_API_BASE_URL: "https://identity.example.test/default",
    SIM_TOKEN_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY"
  };
}

describe("SIM Worker provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an HttpOnly app session without returning the provider JWT", async () => {
    const { database, sessionValues } = fakeDatabase();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sucesso: true, jwt: syntheticJwt }), {
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sucesso: true }), {
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "https://links.example.test/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "usuario.sintetico", password: "senha-sintetica" })
      },
      environment(database)
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly.*SameSite=Lax.*Secure/i);
    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("jwt");
    expect(sessionValues).toHaveLength(1);
    expect(String(sessionValues[0][3])).not.toContain(syntheticJwt);
  });

  it("does not auto-provision an identity that was not approved in LinkGov", async () => {
    const { database, sessionValues } = fakeDatabase(false);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ sucesso: true, jwt: syntheticJwt }), {
            headers: { "Content-Type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ sucesso: true }), {
            headers: { "Content-Type": "application/json" }
          })
        )
    );

    const response = await app.request(
      "https://links.example.test/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "usuario.sintetico", password: "senha-sintetica" })
      },
      environment(database)
    );

    expect(response.status).toBe(403);
    expect(sessionValues).toHaveLength(0);
  });

  it("clears the local session even when provider logout is unavailable", async () => {
    const { database, deletedSessions } = fakeDatabase();

    const response = await app.request(
      "https://links.example.test/api/auth/logout",
      {
        method: "POST",
        headers: { Cookie: "linkgov_session=synthetic-local-session" }
      },
      environment(database)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(deletedSessions).toHaveLength(1);
  });
});
