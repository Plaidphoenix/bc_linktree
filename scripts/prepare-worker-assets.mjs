import { access, rm } from "node:fs/promises";

const distUrl = new URL("../dist/", import.meta.url);
const indexUrl = new URL("index.html", distUrl);

await access(indexUrl).catch(() => {
  throw new Error("Worker frontend build is missing dist/index.html.");
});

// Pages needs this fallback rule; Workers Static Assets handles the SPA fallback itself.
await rm(new URL("_redirects", distUrl), { force: true });
