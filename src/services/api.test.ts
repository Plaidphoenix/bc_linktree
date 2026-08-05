import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAccessUrl, login } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("preserves the backend error code for a pending access request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Identidade validada. A solicitacao foi enviada ao administrador para aprovacao.",
            code: "access_pending"
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(login("unknown-synthetic-user", "synthetic-password")).rejects.toMatchObject({
      status: 403,
      code: "access_pending"
    });
  });
});
