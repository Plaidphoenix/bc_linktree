import { describe, expect, it, vi } from "vitest";
import app from "../../../../worker/index";

describe("reported administrator self-deletion scenario", () => {
  it("rejects deletion when the target is an administrator", async () => {
    const preparedSql: string[] = [];
    const actor = {
      id: "synthetic-admin",
      name: "Synthetic Admin",
      email: "admin@example.invalid",
      username: "admin",
      role: "ADMIN",
      avatar: null,
      description: null,
      status: "active",
      active: 1
    };
    const prepare = vi.fn((sql: string) => {
      preparedSql.push(sql);
      return {
        bind: vi.fn(() => ({
          first: vi.fn(async () => actor),
          run: vi.fn(async () => ({ success: true }))
        }))
      };
    });

    const response = await app.request(
      "https://api.example.gov.br/api/admin/users/synthetic-admin",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" }
      },
      {
        ENVIRONMENT: "local",
        AUTH_PROVIDER: "local",
        DB: { prepare }
      }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Administradores nao podem ser excluidos." });
    expect(preparedSql.some((sql) => /^DELETE FROM users/i.test(sql))).toBe(false);
  });
});
