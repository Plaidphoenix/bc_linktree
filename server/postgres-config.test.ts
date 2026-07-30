import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { postgresPoolConfig, secretValue } from "./postgres-config";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("PostgreSQL server configuration", () => {
  it("preserves DATABASE_URL compatibility", () => {
    expect(
      postgresPoolConfig("linkgov-test", {
        DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:5432/linkgov"
      })
    ).toMatchObject({
      connectionString: "postgresql://synthetic:synthetic@127.0.0.1:5432/linkgov",
      application_name: "linkgov-test"
    });
  });

  it("loads a container password from a mounted secret file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "linkgov-secret-"));
    temporaryDirectories.push(directory);
    const secretPath = join(directory, "postgres_password");
    await writeFile(secretPath, "synthetic-password\n", "utf8");

    expect(
      postgresPoolConfig("linkgov-test", {
        PGHOST: "db",
        PGPORT: "5432",
        PGDATABASE: "linkgov",
        PGUSER: "linkgov",
        PGPASSWORD_FILE: secretPath
      })
    ).toMatchObject({
      host: "db",
      port: 5432,
      database: "linkgov",
      user: "linkgov",
      password: "synthetic-password"
    });
  });

  it("prefers an explicit secret over a file reference", () => {
    expect(
      secretValue("EXAMPLE_SECRET", {
        EXAMPLE_SECRET: "synthetic-direct",
        EXAMPLE_SECRET_FILE: "missing-file"
      })
    ).toBe("synthetic-direct");
  });

  it("fails without exposing a missing secret path", () => {
    expect(() =>
      secretValue("EXAMPLE_SECRET", {
        EXAMPLE_SECRET_FILE: "C:/private/synthetic-person/secret.txt"
      })
    ).toThrow("Nao foi possivel ler o arquivo protegido de EXAMPLE_SECRET.");
  });
});
