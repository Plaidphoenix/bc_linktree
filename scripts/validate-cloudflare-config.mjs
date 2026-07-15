import { readFile } from "node:fs/promises";

const environmentName = process.argv[2] || "production";
const config = JSON.parse(await readFile(new URL("../wrangler.worker.jsonc", import.meta.url), "utf8"));
const environment = config.env?.[environmentName];

if (!environment) {
  console.error(`Cloudflare environment not found: ${environmentName}`);
  process.exitCode = 1;
} else {
  const errors = validateEnvironment(environmentName, environment);
  if (errors.length) {
    console.error(`Cloudflare ${environmentName} configuration is not deployable:`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log(`Cloudflare ${environmentName} configuration is ready for deploy.`);
  }
}

function validateEnvironment(name, environmentConfig) {
  const errors = [];
  const vars = environmentConfig.vars || {};
  const database = environmentConfig.d1_databases?.find((item) => item.binding === "DB");
  const bucket = environmentConfig.r2_buckets?.find((item) => item.binding === "ASSETS");
  const serialized = JSON.stringify(environmentConfig);
  const placeholderMarkers = [
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
    "seudominio.gov.br",
    "sua-equipe.cloudflareaccess.com",
    "substitua-pelo-aud-do-access"
  ];

  if (placeholderMarkers.some((marker) => serialized.includes(marker))) {
    errors.push("remove all placeholder values before deploying");
  }

  if (!database || database.database_name !== `linkgov-db-${name}`) {
    errors.push(`configure the DB binding for linkgov-db-${name}`);
  }
  if (!database || !isUuid(database.database_id)) {
    errors.push("configure a real D1 database_id in the DB binding");
  }

  const expectedBucketName =
    name === "production" ? "linktree" : `linkgov-assets-${name}`;
  if (!bucket || bucket.bucket_name !== expectedBucketName) {
    errors.push(`configure the ASSETS binding for ${expectedBucketName}`);
  }

  if (!isHttpsUrl(vars.APP_BASE_URL)) {
    errors.push("configure APP_BASE_URL with the HTTPS frontend origin");
  }
  if (!isHttpsUrl(vars.ASSET_BASE_URL) || !String(vars.ASSET_BASE_URL).endsWith("/api/assets")) {
    errors.push("configure ASSET_BASE_URL with the Worker HTTPS /api/assets endpoint");
  }

  const authProvider = String(vars.AUTH_PROVIDER || "").toLowerCase();
  if (authProvider === "access") {
    if (!isHttpsUrl(vars.ACCESS_TEAM_DOMAIN) || !String(vars.ACCESS_TEAM_DOMAIN).includes(".cloudflareaccess.com")) {
      errors.push("configure ACCESS_TEAM_DOMAIN from Cloudflare Access");
    }
    if (!vars.ACCESS_AUD || String(vars.ACCESS_AUD).length < 20) {
      errors.push("configure ACCESS_AUD from the Cloudflare Access application");
    }
  } else if (authProvider === "local") {
    if (process.env.ALLOW_INSECURE_LOCAL_AUTH !== "1") {
      errors.push("local authentication requires explicit temporary approval via ALLOW_INSECURE_LOCAL_AUTH=1");
    }
  } else {
    errors.push("AUTH_PROVIDER must be access or an explicitly approved temporary local mode");
  }

  return errors;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch {
    return false;
  }
}
