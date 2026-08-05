import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getPublicProfile: vi.fn(),
  trackClick: vi.fn(),
  trackView: vi.fn()
}));

vi.mock("./config/runtime", async () => {
  const actual = await vi.importActual<typeof import("./config/runtime")>("./config/runtime");
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

vi.mock("./services/api", async () => {
  const actual = await vi.importActual<typeof import("./services/api")>("./services/api");
  return {
    ...actual,
    getPublicProfile: apiMocks.getPublicProfile,
    trackClick: apiMocks.trackClick,
    trackView: apiMocks.trackView
  };
});

import { App } from "./App";
import { seedState } from "./data/seed";
import { ApiError } from "./services/api";

describe("public page outage experience", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", `/${seedState.profile.slug}`);
    apiMocks.getPublicProfile.mockReset();
    apiMocks.trackClick.mockReset().mockResolvedValue(undefined);
    apiMocks.trackView.mockReset().mockResolvedValue(undefined);
  });

  it("shows a clear read-only snapshot notice without recording a view", async () => {
    apiMocks.getPublicProfile.mockResolvedValue({
      profile: seedState.profile,
      links: seedState.links,
      source: "cache",
      cachedAt: "2026-08-05T15:30:00.000Z"
    });

    render(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent(/servidor temporariamente indisponivel/i);
    expect(screen.getByRole("heading", { level: 1, name: seedState.profile.title })).toBeInTheDocument();
    expect(apiMocks.trackView).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable server from a missing public page and retries", async () => {
    apiMocks.getPublicProfile.mockRejectedValue(new ApiError("Sem conexao", 0));

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /servidor temporariamente indisponivel/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await waitFor(() => expect(apiMocks.getPublicProfile).toHaveBeenCalledTimes(2));
  });
});
