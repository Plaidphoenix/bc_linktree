import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/runtime", async () => {
  const actual = await vi.importActual<typeof import("../config/runtime")>("../config/runtime");
  return {
    ...actual,
    runtimeConfig: {
      apiBaseUrl: null,
      demoFallbackEnabled: false,
      authProvider: "sim",
      simPasswordResetUrl: null
    }
  };
});

import { seedState } from "../data/seed";
import { getPublicProfile } from "./api";

describe("public profile offline snapshots", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a successful public response and reuses it during an outage", async () => {
    const payload = { profile: seedState.profile, links: seedState.links };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
      )
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicProfile(seedState.profile.slug)).resolves.toMatchObject({
      ...payload,
      source: "network"
    });

    const cached = await getPublicProfile(seedState.profile.slug);
    expect(cached).toMatchObject({ ...payload, source: "cache" });
    expect(cached.cachedAt).toEqual(expect.any(String));
  });

  it("uses the snapshot for temporary server failures but never masks a 404", async () => {
    const payload = { profile: seedState.profile, links: seedState.links };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "maintenance" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await getPublicProfile(seedState.profile.slug);
    await expect(getPublicProfile(seedState.profile.slug)).resolves.toMatchObject({ source: "cache" });
    await expect(getPublicProfile(seedState.profile.slug)).rejects.toMatchObject({ status: 404 });
  });

  it("reports a connection error when the device has no saved copy", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network unavailable")));

    await expect(getPublicProfile("pagina-sem-cache")).rejects.toMatchObject({ status: 0 });
  });

  it("identifies a public response restored by the service worker as cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ profile: seedState.profile, links: seedState.links }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-LinkGov-Offline": "true",
            "X-LinkGov-Cached-At": "2026-08-05T15:30:00.000Z"
          }
        })
      )
    );

    await expect(getPublicProfile(seedState.profile.slug)).resolves.toMatchObject({
      source: "cache",
      cachedAt: "2026-08-05T15:30:00.000Z"
    });
  });
});
