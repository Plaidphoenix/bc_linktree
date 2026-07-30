import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

type Environment = Record<string, string | undefined>;

export function postgresPoolConfig(
  applicationName: string,
  environment: Environment = process.env
): PoolConfig {
  const connectionString = optionalValue(environment.DATABASE_URL);
  if (connectionString) {
    return {
      connectionString,
      application_name: applicationName
    };
  }

  return {
    host: requiredValue("PGHOST", environment),
    port: integerValue("PGPORT", environment.PGPORT || "5432", 1, 65535),
    database: requiredValue("PGDATABASE", environment),
    user: requiredValue("PGUSER", environment),
    password: secretValue("PGPASSWORD", environment),
    application_name: applicationName
  };
}

export function secretValue(name: string, environment: Environment = process.env) {
  const directValue = optionalValue(environment[name]);
  if (directValue) {
    return directValue;
  }

  const fileName = optionalValue(environment[`${name}_FILE`]);
  if (!fileName) {
    throw new ConfigurationError(
      `Configure ${name} ou ${name}_FILE no ambiente protegido do servidor.`
    );
  }

  try {
    const value = readFileSync(fileName, "utf8").trim();
    if (!value || value.includes("\0")) {
      throw new Error("invalid secret");
    }
    return value;
  } catch {
    throw new ConfigurationError(`Nao foi possivel ler o arquivo protegido de ${name}.`);
  }
}

function requiredValue(name: string, environment: Environment) {
  const value = optionalValue(environment[name]);
  if (!value) {
    throw new ConfigurationError(`Variavel obrigatoria ausente: ${name}.`);
  }
  return value;
}

function optionalValue(value: string | undefined) {
  return String(value || "").trim();
}

function integerValue(name: string, value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigurationError(
      `${name} deve ser um inteiro entre ${minimum} e ${maximum}.`
    );
  }
  return parsed;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
