import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const environmentFile = resolve(process.env.DOCKER_ENV_FILE || ".env.docker.example");
const composeFile = resolve("compose.yaml");
const command = spawnSync(
  "docker",
  ["compose", "--file", composeFile, "--env-file", environmentFile, "config", "--format", "json"],
  { encoding: "utf8" }
);

if (command.status !== 0) {
  console.error("Docker Compose configuration could not be resolved.");
  process.exit(1);
}

const config = JSON.parse(command.stdout);
const database = config.services?.db;
const api = config.services?.api;
const backup = config.services?.backup;

if (!database || !api || !backup) {
  console.error("Docker Compose is missing a required LinkGov service.");
  process.exit(1);
}

const apiPort = api.ports?.[0];
const apiSecrets = (api.secrets || []).map((secret) =>
  typeof secret === "string" ? secret : secret.source
);
const checks = {
  DatabaseHasNoPublishedPorts: !database.ports?.length,
  DatabaseUsesPostgres18VolumePath: database.volumes?.some(
    (volume) => volume.target === "/var/lib/postgresql"
  ),
  ApiBindsLoopbackByDefault: apiPort?.host_ip === "127.0.0.1",
  ApiWaitsForMigration: api.depends_on?.migrate?.condition === "service_completed_successfully",
  ApiIsReadOnly: api.read_only === true,
  ApiDropsAllCapabilities: api.cap_drop?.includes("ALL"),
  BackupIncludesAssets: backup.volumes?.some(
    (volume) => volume.target === "/assets" && volume.read_only === true
  ),
  DatabasePasswordUsesSecretFile:
    database.environment?.POSTGRES_PASSWORD_FILE === "/run/secrets/postgres_admin_password",
  ApplicationIsNotDatabaseSuperuser:
    database.environment?.POSTGRES_USER !== api.environment?.PGUSER,
  ApplicationPasswordUsesSeparateSecret:
    api.environment?.PGPASSWORD_FILE === "/run/secrets/postgres_app_password" &&
    apiSecrets.includes("postgres_app_password"),
  ProductionDeclaresHttpsTermination:
    api.environment?.ENVIRONMENT !== "production" ||
    api.environment?.HTTPS_TERMINATED_UPSTREAM === "true"
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

if (failed.length) {
  console.error(`Docker Compose security validation failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`Docker Compose security validation passed (${Object.keys(checks).length} checks).`);
