import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  getInstitutionalSession: vi.fn(),
  getAdminState: vi.fn(),
  getUsers: vi.fn(),
  getSimAccessRequests: vi.fn(),
  approveSimAccessRequest: vi.fn(),
  rejectSimAccessRequest: vi.fn()
}));

vi.mock("./config/runtime", async () => {
  const actual = await vi.importActual<typeof import("./config/runtime")>("./config/runtime");
  return {
    ...actual,
    runtimeConfig: {
      apiBaseUrl: null,
      demoFallbackEnabled: false,
      authProvider: "sim",
      simPasswordResetUrl: "https://identity.example.test/recuperar-senha"
    }
  };
});

vi.mock("./services/api", async () => {
  const actual = await vi.importActual<typeof import("./services/api")>("./services/api");
  return {
    ...actual,
    login: apiMocks.login,
    getInstitutionalSession: apiMocks.getInstitutionalSession,
    getAdminState: apiMocks.getAdminState,
    getUsers: apiMocks.getUsers,
    getSimAccessRequests: apiMocks.getSimAccessRequests,
    approveSimAccessRequest: apiMocks.approveSimAccessRequest,
    rejectSimAccessRequest: apiMocks.rejectSimAccessRequest
  };
});

import { App } from "./App";
import { seedState, seedUsers } from "./data/seed";
import { ApiError } from "./services/api";

describe("SIM application flow", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/login");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    apiMocks.login.mockReset().mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: seedState.user
    });
    apiMocks.getInstitutionalSession.mockReset().mockResolvedValue({
      user: seedState.user,
      provider: "sim"
    });
    apiMocks.getAdminState.mockReset().mockResolvedValue(seedState);
    apiMocks.getUsers.mockReset().mockResolvedValue(seedUsers);
    apiMocks.getSimAccessRequests.mockReset().mockResolvedValue([]);
    apiMocks.approveSimAccessRequest.mockReset().mockResolvedValue({
      ...seedUsers[1],
      id: "usr-approved",
      name: "Pessoa Sintetica",
      role: "EDITOR"
    });
    apiMocks.rejectSimAccessRequest.mockReset().mockResolvedValue({ ok: true });
  });

  it("uses the municipal identity form without exposing a bearer token in localStorage", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/usuario institucional/i), {
      target: { value: "usuario.sintetico" }
    });
    fireEvent.change(screen.getByLabelText(/^senha$/i), {
      target: { value: "senha-sintetica" }
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar com sim/i }));

    await waitFor(() => expect(apiMocks.login).toHaveBeenCalledWith("usuario.sintetico", "senha-sintetica"));
    expect(localStorage.getItem("linkgov.session")).toBeNull();
    expect(await screen.findByRole("heading", { level: 1, name: seedState.profile.title })).toBeInTheDocument();
  });

  it("renders an accessible animated alert when the identity service is unavailable", async () => {
    apiMocks.login.mockRejectedValue(new ApiError("Servico de identidade temporariamente indisponivel.", 503));
    render(<App />);

    fireEvent.change(screen.getByLabelText(/usuario institucional/i), {
      target: { value: "usuario.sintetico" }
    });
    fireEvent.change(screen.getByLabelText(/^senha$/i), {
      target: { value: "senha-sintetica" }
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar com sim/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/temporariamente indisponivel/i);
    expect(screen.getByRole("alert")).toHaveClass("alert-banner", "error");
  });

  it("requires the internal SIM identifier when an admin creates a user", async () => {
    window.history.pushState({}, "", "/admin/users");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /novo usuario/i }));

    expect(screen.getByLabelText(/identificador interno sim/i)).toBeRequired();
    expect(screen.getByText(/cpf e jwt nao devem ser informados/i)).toBeInTheDocument();
  });

  it("notifies the admin and approves a SIM identity for selected links", async () => {
    const request = {
      id: "req-synthetic",
      displayName: "Pessoa Sintetica",
      institutionalEmail: "pessoa@example.test",
      status: "pending" as const,
      attemptsCount: 2,
      requestedAt: "2026-08-04T12:00:00.000Z",
      lastAttemptAt: "2026-08-04T12:05:00.000Z"
    };
    apiMocks.getSimAccessRequests.mockResolvedValue([request]);
    window.history.pushState({}, "", "/admin/links");

    render(<App />);

    const notifications = await screen.findByRole("button", { name: /notificacoes: 1 solicitacoes pendentes/i });
    fireEvent.click(notifications);
    fireEvent.click(await screen.findByRole("button", { name: /pessoa sintetica/i }));

    expect(screen.getByRole("dialog", { name: /revisar acesso/i })).toBeInTheDocument();
    const allowedLink = seedState.links[0];
    fireEvent.click(screen.getByRole("checkbox", { name: allowedLink.title }));
    fireEvent.click(screen.getByRole("button", { name: /^aprovar acesso$/i }));

    await waitFor(() =>
      expect(apiMocks.approveSimAccessRequest).toHaveBeenCalledWith("req-synthetic", {
        role: "EDITOR",
        profileId: seedState.profile.id,
        linkIds: [allowedLink.id],
        email: "pessoa@example.test"
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /revisar acesso/i })).not.toBeInTheDocument());
  });

  it("requires confirmation before rejecting a SIM access request", async () => {
    apiMocks.getSimAccessRequests.mockResolvedValue([
      {
        id: "req-reject-synthetic",
        displayName: "Pessoa para Recusa",
        institutionalEmail: null,
        status: "pending",
        attemptsCount: 1,
        requestedAt: "2026-08-04T12:00:00.000Z",
        lastAttemptAt: "2026-08-04T12:00:00.000Z"
      }
    ]);
    window.history.pushState({}, "", "/admin/links");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /notificacoes: 1 solicitacoes pendentes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /pessoa para recusa/i }));
    fireEvent.click(screen.getByRole("button", { name: /^recusar acesso$/i }));

    expect(apiMocks.rejectSimAccessRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /confirmar recusa/i }));
    await waitFor(() => expect(apiMocks.rejectSimAccessRequest).toHaveBeenCalledWith("req-reject-synthetic"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /revisar acesso/i })).not.toBeInTheDocument());
  });
});
