import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  getInstitutionalSession: vi.fn(),
  getAdminState: vi.fn(),
  getUsers: vi.fn()
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
    getUsers: apiMocks.getUsers
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
});
