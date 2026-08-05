import { describe, expect, it } from "vitest";
import app, { type Bindings } from "./index";

type BoundStatement = {
  sql: string;
  values: unknown[];
  bind: (...values: unknown[]) => BoundStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ success: true; results: T[]; meta: { changes: number } }>;
  run: () => Promise<{ success: true; results: never[]; meta: { changes: number } }>;
};

const admin = {
  id: "usr_admin",
  name: "Administrador Sintetico",
  email: "admin@example.test",
  username: "admin-synthetic",
  role: "ADMIN",
  avatar: null,
  description: null,
  status: "active",
  active: 1,
  session_provider: "local",
  provider_token: null
};

const pendingRequest = {
  id: "req_synthetic",
  external_subject: "subject-synthetic",
  display_name: "Pessoa Sintetica",
  institutional_email: "pessoa@example.test",
  status: "pending",
  attempts_count: 2,
  requested_at: "2026-08-04T12:00:00.000Z",
  last_attempt_at: "2026-08-04T12:05:00.000Z",
  reviewed_at: null
};

function fakeDatabase(role: "ADMIN" | "GESTOR" = "ADMIN") {
  const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  let createdUserId = "";
  let createdRole = "EDITOR";

  const prepare = (sql: string): BoundStatement => {
    const statement: BoundStatement = {
      sql,
      values: [],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async first<T>() {
        if (sql.includes("FROM sessions s")) {
          return { ...admin, role } as T;
        }
        if (sql.includes("FROM sim_access_requests")) {
          return pendingRequest as T;
        }
        if (sql.includes("FROM profiles WHERE id")) {
          return {
            id: "prf_synthetic",
            user_id: "usr_admin",
            slug: "synthetic",
            title: "Pagina Sintetica",
            description: "",
            avatar: null,
            banner: null,
            primary_color: "#001e40",
            secondary_color: "#005db6",
            theme: "institucional",
            button_radius: 8,
            font_family: "Inter",
            public: 1
          } as T;
        }
        if (sql.includes("SELECT id FROM users WHERE email")) {
          return null;
        }
        if (sql.includes("FROM users WHERE id")) {
          return {
            id: createdUserId,
            name: pendingRequest.display_name,
            email: pendingRequest.institutional_email,
            username: "pessoa-sintetica",
            role: createdRole,
            avatar: "/assets/crest.svg",
            description: "Acesso institucional aprovado por administrador.",
            status: "active",
            active: 1,
            external_subject: pendingRequest.external_subject
          } as T;
        }
        return null;
      },
      async all<T>() {
        if (sql.includes("FROM sim_access_requests")) {
          return { success: true, results: [pendingRequest as T], meta: { changes: 0 } };
        }
        if (sql.includes("FROM links")) {
          return {
            success: true,
            results: [
              {
                id: "lnk_allowed",
                profile_id: "prf_synthetic",
                title: "Link autorizado",
                description: "",
                url: "https://example.test",
                icon: "Link",
                sort_order: 1,
                active: 1,
                featured: 0,
                clicks: 0
              } as T
            ],
            meta: { changes: 0 }
          };
        }
        return { success: true, results: [], meta: { changes: 0 } };
      },
      async run() {
        runs.push({ sql, values: this.values });
        return { success: true, results: [], meta: { changes: 1 } };
      }
    };
    return statement;
  };

  const database = {
    prepare,
    async batch(statements: BoundStatement[]) {
      const captured = statements.map((statement) => ({ sql: statement.sql, values: statement.values }));
      batches.push(captured);
      const userInsert = captured.find((statement) => statement.sql.includes("INSERT INTO users"));
      if (userInsert) {
        createdUserId = String(userInsert.values[0]);
        createdRole = String(userInsert.values[3]);
      }
      return statements.map(() => ({ success: true, results: [], meta: { changes: 1 } }));
    }
  };

  return { database: database as unknown as D1Database, batches, runs };
}

function environment(database: D1Database): Bindings {
  return {
    DB: database,
    ENVIRONMENT: "test",
    AUTH_PROVIDER: "local",
    APP_BASE_URL: "https://links.example.test"
  };
}

describe("SIM access request administration", () => {
  it("lists pending requests without returning the SIM subject", async () => {
    const { database } = fakeDatabase();
    const response = await app.request(
      "https://links.example.test/api/admin/access-requests",
      { headers: { Authorization: "Bearer synthetic-session" } },
      environment(database)
    );
    const body = (await response.json()) as { requests: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(body.requests[0]).toMatchObject({
      id: pendingRequest.id,
      displayName: pendingRequest.display_name,
      status: "pending",
      attemptsCount: 2
    });
    expect(body.requests[0]).not.toHaveProperty("external_subject");
    expect(body.requests[0]).not.toHaveProperty("externalSubject");
  });

  it("approves an editor only for the selected page and links", async () => {
    const { database, batches } = fakeDatabase();
    const response = await app.request(
      "https://links.example.test/api/admin/access-requests/req_synthetic/approve",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-session",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          role: "EDITOR",
          profileId: "prf_synthetic",
          linkIds: ["lnk_allowed"],
          username: "pessoa-sintetica"
        })
      },
      environment(database)
    );
    const body = (await response.json()) as { user: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ role: "EDITOR", username: "pessoa-sintetica" });
    expect(body.user).not.toHaveProperty("external_subject");
    expect(batches).toHaveLength(1);
    expect(batches[0].some((statement) => statement.sql.includes("INSERT INTO page_permissions"))).toBe(true);
    expect(
      batches[0].some(
        (statement) => statement.sql.includes("INSERT INTO editor_link_permissions") && statement.values.includes("lnk_allowed")
      )
    ).toBe(true);
  });

  it("rejects access request administration for non-admin users", async () => {
    const { database } = fakeDatabase("GESTOR");
    const response = await app.request(
      "https://links.example.test/api/admin/access-requests",
      { headers: { Authorization: "Bearer synthetic-session" } },
      environment(database)
    );

    expect(response.status).toBe(403);
  });

  it("marks a pending request as rejected without creating a user", async () => {
    const { database, batches, runs } = fakeDatabase();
    const response = await app.request(
      "https://links.example.test/api/admin/access-requests/req_synthetic/reject",
      {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-session" }
      },
      environment(database)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(batches).toHaveLength(0);
    expect(
      runs.some(
        (statement) =>
          statement.sql.includes("UPDATE sim_access_requests") &&
          statement.sql.includes("status = 'rejected'") &&
          statement.values.includes("req_synthetic")
      )
    ).toBe(true);
  });
});
