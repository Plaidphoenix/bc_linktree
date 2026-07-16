import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getAccessSession: vi.fn(),
  getAdminState: vi.fn()
}));

vi.mock("./config/runtime", () => ({
  runtimeConfig: {
    apiBaseUrl: "https://api.example.workers.dev",
    demoFallbackEnabled: false,
    authProvider: "access"
  }
}));

vi.mock("./services/api", async () => {
  const actual = await vi.importActual<typeof import("./services/api")>("./services/api");
  return {
    ...actual,
    getAccessSession: apiMocks.getAccessSession,
    getAdminState: apiMocks.getAdminState
  };
});

import { App } from "./App";
import { seedState } from "./data/seed";
import { ApiError } from "./services/api";
import { accessSessionStore } from "./services/access-session";

describe("Cloudflare Access application flow", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    apiMocks.getAccessSession.mockReset().mockResolvedValue({ user: seedState.user, provider: "access" });
    apiMocks.getAdminState.mockReset().mockResolvedValue(seedState);
  });

  it("loads the admin panel without requiring a local bearer token", async () => {
    window.history.pushState({}, "", "/admin/links");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: seedState.profile.title })).toBeInTheDocument();
    expect(apiMocks.getAdminState).toHaveBeenCalledOnce();
  });

  it("redirects an existing Access session away from login", async () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.rememberAdminPath("/admin/appearance");
    window.history.pushState({}, "", "/login");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/admin/appearance"));
    expect(apiMocks.getAccessSession).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { level: 1, name: seedState.profile.title })).toBeInTheDocument();
  });

  it("shows the email-code entry point when there is no known session", () => {
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(screen.getByRole("link", { name: /entrar com codigo por e-mail/i })).toHaveAttribute(
      "href",
      "https://api.example.workers.dev/api/auth/access/start"
    );
    expect(apiMocks.getAccessSession).not.toHaveBeenCalled();
  });

  it("keeps cached admin data visible and read-only while offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);
    accessSessionStore.rememberAdminPath("/admin/links");
    apiMocks.getAdminState.mockRejectedValue(new ApiError("Sem conexao", 0));
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent(/ultima versao salva/i);
    expect(window.location.pathname).toBe("/admin/links");
    expect(screen.getByRole("button", { name: /adicionar novo link/i })).toBeDisabled();
    expect(apiMocks.getAccessSession).not.toHaveBeenCalled();
  });

  it("clears the cached Access hint after an authorization rejection", async () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);
    apiMocks.getAdminState.mockRejectedValue(new ApiError("Sessao invalida", 401));
    window.history.pushState({}, "", "/admin/links");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(accessSessionStore.hasSession()).toBe(false);
    expect(accessSessionStore.getCachedAdminState()).toBeNull();
  });

  it("does not treat an orphaned cache as an offline session", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    accessSessionStore.cacheAdminState(seedState);
    apiMocks.getAdminState.mockRejectedValue(new ApiError("Sem conexao", 0));
    window.history.pushState({}, "", "/admin/links");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not substitute cached data for an HTTP service failure", async () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);
    apiMocks.getAdminState.mockRejectedValue(new ApiError("Servico indisponivel", 500));
    window.history.pushState({}, "", "/admin/links");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
