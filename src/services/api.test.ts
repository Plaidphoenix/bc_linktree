import { describe, expect, it } from "vitest";
import { buildAccessUrl } from "./api";

describe("Cloudflare Access frontend URLs", () => {
  it("builds remote login and logout URLs without duplicate slashes", () => {
    expect(buildAccessUrl("https://api.example.workers.dev/", "/api/auth/access/start")).toBe(
      "https://api.example.workers.dev/api/auth/access/start"
    );
    expect(buildAccessUrl("https://api.example.workers.dev", "/cdn-cgi/access/logout")).toBe(
      "https://api.example.workers.dev/cdn-cgi/access/logout"
    );
  });

  it("keeps same-origin paths relative during local development", () => {
    expect(buildAccessUrl(null, "/api/auth/access/start")).toBe("/api/auth/access/start");
  });
});
