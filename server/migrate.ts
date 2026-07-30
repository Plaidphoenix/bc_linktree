import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { postgresPoolConfig } from "./postgres-config";

const migrationsPath = resolve(process.env.MIGRATIONS_PATH || join(process.cwd(), "migrations", "postgres"));
const pool = new Pool({
  ...postgresPoolConfig("linkgov-migrations"),
  max: 1,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await readdir(migrationsPath))
    .filter((name) => /^\d+_[A-Za-z0-9_-]+\.sql$/.test(name))
    .sort();

  for (const name of files) {
    const sql = await readFile(join(migrationsPath, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [name]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration was modified: ${name}`);
      }
      console.log(`Already applied: ${name}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum]
      );
      await client.query("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
