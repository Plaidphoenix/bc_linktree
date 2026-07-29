import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: {
    index: "server/index.ts",
    migrate: "server/migrate.ts",
    "bootstrap-admin": "server/bootstrap-admin.ts"
  },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  outdir: "dist-server",
  outExtension: { ".js": ".mjs" },
  sourcemap: true,
  legalComments: "none"
});

await mkdir("dist-server/migrations", { recursive: true });
await cp("migrations/postgres", "dist-server/migrations", { recursive: true });
