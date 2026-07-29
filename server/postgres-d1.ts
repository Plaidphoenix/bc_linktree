import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export class PostgresD1Database {
  constructor(private readonly pool: Pool) {}

  prepare(sql: string) {
    return new PostgresPreparedStatement(this.pool, sql);
  }

  async batch(statements: unknown[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        if (!(statement instanceof PostgresPreparedStatement)) {
          throw new TypeError("Postgres batch received an incompatible statement.");
        }
        results.push(await statement.execute(client));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export class PostgresPreparedStatement {
  constructor(
    private readonly queryable: Queryable,
    readonly sql: string,
    readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new PostgresPreparedStatement(this.queryable, this.sql, values);
  }

  async first<T extends QueryResultRow>() {
    const result = await this.query<T>(this.queryable);
    return result.rows[0] || null;
  }

  async all<T extends QueryResultRow>() {
    return d1Result(await this.query<T>(this.queryable));
  }

  async run() {
    return d1Result(await this.query(this.queryable));
  }

  async execute(queryable: Queryable) {
    return d1Result(await this.query(queryable));
  }

  private query<T extends QueryResultRow = QueryResultRow>(queryable: Queryable) {
    return queryable.query<T>(rewriteD1Query(this.sql), this.values);
  }
}

export function rewriteD1Query(sql: string) {
  let output = "";
  let parameter = 0;
  let state: "plain" | "single" | "double" | "line-comment" | "block-comment" = "plain";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      output += character;
      if (character === "\n") state = "plain";
      continue;
    }

    if (state === "block-comment") {
      output += character;
      if (character === "*" && next === "/") {
        output += next;
        index += 1;
        state = "plain";
      }
      continue;
    }

    if (state === "single") {
      output += character;
      if (character === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (character === "'") {
        state = "plain";
      }
      continue;
    }

    if (state === "double") {
      output += character;
      if (character === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (character === '"') {
        state = "plain";
      }
      continue;
    }

    if (character === "-" && next === "-") {
      output += character + next;
      index += 1;
      state = "line-comment";
    } else if (character === "/" && next === "*") {
      output += character + next;
      index += 1;
      state = "block-comment";
    } else if (character === "'") {
      output += character;
      state = "single";
    } else if (character === '"') {
      output += character;
      state = "double";
    } else if (character === "?") {
      parameter += 1;
      output += `$${parameter}`;
    } else {
      output += character;
    }
  }

  return output;
}

function d1Result<T extends QueryResultRow>(result: QueryResult<T>) {
  return {
    success: true,
    results: result.rows,
    meta: {
      changes: result.rowCount || 0
    }
  };
}
