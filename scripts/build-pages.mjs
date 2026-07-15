import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const environment = process.argv[2];
if (environment !== "staging" && environment !== "production") {
  console.error("Use an explicit Pages build target: staging or production.");
  process.exit(1);
}

const apiBase = process.env.VITE_API_BASE_URL?.trim();
const authProvider = process.env.VITE_AUTH_PROVIDER?.trim().toLowerCase();
let apiUrl;
try {
  apiUrl = apiBase ? new URL(apiBase) : null;
} catch {
  apiUrl = null;
}

const apiHostname = apiUrl?.hostname.toLowerCase() || "";
const placeholderHost =
  !apiHostname ||
  apiHostname === "localhost" ||
  apiHostname === "127.0.0.1" ||
  apiHostname === "[::1]" ||
  apiHostname.endsWith(".invalid") ||
  apiHostname === "example.com" ||
  apiHostname.endsWith(".example.com") ||
  apiHostname.endsWith(".test") ||
  apiHostname.includes("seudominio");

if (
  !apiUrl ||
  apiUrl.protocol !== "https:" ||
  apiUrl.pathname !== "/" ||
  apiUrl.search ||
  apiUrl.hash ||
  apiUrl.username ||
  apiUrl.password ||
  placeholderHost
) {
  console.error("VITE_API_BASE_URL must be an explicit HTTPS origin for the selected Pages environment.");
  process.exit(1);
}

if (authProvider !== "access") {
  console.error("VITE_AUTH_PROVIDER=access is required for staging and production Pages builds.");
  process.exit(1);
}

const buildEnv = {
  ...process.env,
  VITE_API_BASE_URL: apiUrl.origin,
  VITE_AUTH_PROVIDER: "access",
  VITE_ENABLE_DEMO_FALLBACK: "false",
  VITE_DEMO_PASSWORD: ""
};
const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const typecheck = spawnSync(process.execPath, [tsc, "--noEmit"], { env: buildEnv, stdio: "inherit" });
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const build = spawnSync(process.execPath, [vite, "build"], { env: buildEnv, stdio: "inherit" });
process.exit(build.status ?? 1);
