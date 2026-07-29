import { serve } from "@hono/node-server";
import { Pool } from "pg";
import app, { type Bindings } from "../worker/index";
import { FilesystemAssets } from "./filesystem-assets";
import { PostgresD1Database } from "./postgres-d1";

const databaseUrl = requiredEnvironment("DATABASE_URL");
const assetPath = requiredEnvironment("ASSET_STORAGE_PATH");
const appBaseUrl = requiredEnvironment("APP_BASE_URL");
const port = numberEnvironment("PORT", 8787, 1, 65535);
const hostname = process.env.HOST?.trim() || "127.0.0.1";
const pool = new Pool({
  connectionString: databaseUrl,
  max: numberEnvironment("DATABASE_POOL_SIZE", 10, 1, 50),
  application_name: "linkgov-institutional-api"
});

const bindings = {
  DB: new PostgresD1Database(pool),
  ASSETS: new FilesystemAssets(assetPath),
  ENVIRONMENT: process.env.ENVIRONMENT || "production",
  AUTH_PROVIDER: process.env.AUTH_PROVIDER || "sim",
  APP_BASE_URL: appBaseUrl,
  ADMIN_BASE_URL: process.env.ADMIN_BASE_URL || appBaseUrl,
  ASSET_BASE_URL: process.env.ASSET_BASE_URL || `${appBaseUrl.replace(/\/$/, "")}/api/assets`,
  EMAIL_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL,
  EMAIL_WEBHOOK_TOKEN: process.env.EMAIL_WEBHOOK_TOKEN,
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
  SIM_API_BASE_URL: process.env.SIM_API_BASE_URL,
  SIM_LOGIN_PATH: process.env.SIM_LOGIN_PATH,
  SIM_VALIDATE_PATH: process.env.SIM_VALIDATE_PATH,
  SIM_LOGOUT_PATH: process.env.SIM_LOGOUT_PATH,
  SIM_LOGIN_CONTENT_TYPE: process.env.SIM_LOGIN_CONTENT_TYPE,
  SIM_CLIENT_TYPE: process.env.SIM_CLIENT_TYPE,
  SIM_SUBJECT_CLAIM: process.env.SIM_SUBJECT_CLAIM,
  SIM_TOKEN_ENCRYPTION_KEY: process.env.SIM_TOKEN_ENCRYPTION_KEY,
  SIM_REQUEST_TIMEOUT_MS: process.env.SIM_REQUEST_TIMEOUT_MS,
  SIM_SESSION_TTL_SECONDS: process.env.SIM_SESSION_TTL_SECONDS
} as unknown as Bindings;

const server = serve({
  fetch: (request) => app.fetch(request, bindings),
  hostname,
  port
});

console.log(`LinkGov API listening on http://${hostname}:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}
