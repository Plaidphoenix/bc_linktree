import { describe, expect, it } from "vitest";
import { rewriteD1Query } from "./postgres-d1";

describe("PostgreSQL D1 compatibility adapter", () => {
  it("rewrites positional placeholders for PostgreSQL", () => {
    expect(rewriteD1Query("SELECT * FROM users WHERE id = ? AND status = ?")).toBe(
      "SELECT * FROM users WHERE id = $1 AND status = $2"
    );
  });

  it("does not rewrite question marks inside SQL strings or comments", () => {
    const sql = "SELECT '?' AS literal, id FROM users WHERE id = ? -- ?\n/* ? */";
    expect(rewriteD1Query(sql)).toBe(
      "SELECT '?' AS literal, id FROM users WHERE id = $1 -- ?\n/* ? */"
    );
  });
});
