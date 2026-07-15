import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { seedLinks, seedProfiles, seedState, seedUsers } from "./data/seed";

describe("App critical flows", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows password reset entry point on login", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /esqueceu a senha/i }));

    expect(screen.getByRole("heading", { name: /redefinir senha/i })).toBeInTheDocument();
    expect(screen.getByText(/link seguro/i)).toBeInTheDocument();
  });

  it("renders a public profile from the local fallback", async () => {
    window.history.pushState({}, "", "/@saude");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /secretaria municipal de saude/i })).toBeInTheDocument();
    expect(screen.getByText(/portal da transparencia/i)).toBeInTheDocument();
  });

  it("does not open a persisted public link with a non-HTTP scheme", async () => {
    localStorage.setItem(
      "linkgov.demo-state",
      JSON.stringify({
        user: seedState.user,
        users: seedUsers,
        profiles: seedProfiles,
        links: seedLinks.map((link, index) => (index === 0 ? { ...link, url: "data:text/plain,synthetic" } : link)),
        selectedProfileId: "prf_saude"
      })
    );
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("synthetic network failure"))));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    window.history.pushState({}, "", "/@saude");
    render(<App />);

    const link = await screen.findByRole("button", { name: /portal da transparencia/i });
    expect(link).toBeDisabled();
    fireEvent.click(link);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens a safe public link even when click tracking is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("synthetic network failure"))));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    window.history.pushState({}, "", "/@saude");
    render(<App />);

    const link = await screen.findByRole("button", { name: /portal da transparencia/i });
    fireEvent.click(link);

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https?:\/\//), "_blank", "noopener,noreferrer");
  });

  it("clears a rejected admin session instead of entering demo mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Sessao invalida." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    localStorage.setItem("linkgov.session", "synthetic-session");
    window.history.pushState({}, "", "/admin/links");
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(localStorage.getItem("linkgov.session")).toBeNull();
  });

  it("opens the create-user dialog for admins", async () => {
    localStorage.setItem("linkgov.session", "demo-test");
    window.history.pushState({}, "", "/admin/users");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /novo usuario/i }));

    expect(screen.getByRole("heading", { name: /novo usuario/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/papel/i)).toBeInTheDocument();
  });

  it("opens the create-page dialog for admins", async () => {
    localStorage.setItem("linkgov.session", "demo-test");
    window.history.pushState({}, "", "/admin/pages");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /nova pagina/i }));

    expect(screen.getByRole("heading", { name: /nova pagina publica/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/link publico/i)).toBeInTheDocument();
  });

  it("puts a newly added link in edit mode", async () => {
    localStorage.setItem("linkgov.session", "demo-test");
    window.history.pushState({}, "", "/admin/links");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /adicionar novo link/i }));

    expect(await screen.findByDisplayValue(/novo servico/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/https:\/\/example.gov.br/i)).toBeInTheDocument();
  });

  it("keeps the selected public page while navigating admin sections", async () => {
    localStorage.setItem("linkgov.session", "demo-test");
    window.history.pushState({}, "", "/admin/links");
    render(<App />);

    fireEvent.change(await screen.findByLabelText(/selecionar pagina publica/i), { target: { value: "prf_educacao" } });
    expect(await screen.findByRole("heading", { level: 1, name: /secretaria municipal de educacao/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /aparencia/i })[0]);

    expect(await screen.findByRole("heading", { level: 1, name: /secretaria municipal de educacao/i })).toBeInTheDocument();
  });

  it("saves appearance changes on the selected non-default page in local fallback", async () => {
    localStorage.setItem("linkgov.session", "demo-test");
    localStorage.setItem(
      "linkgov.demo-state",
      JSON.stringify({
        user: seedState.user,
        users: seedUsers,
        profiles: seedProfiles,
        links: seedLinks,
        selectedProfileId: "prf_educacao"
      })
    );
    window.history.pushState({}, "", "/admin/appearance");
    render(<App />);

    const nameInput = await screen.findByLabelText(/nome da pagina/i);
    fireEvent.change(nameInput, { target: { value: "Portal Municipal de Educacao" } });
    fireEvent.click(screen.getByRole("button", { name: /publicar alteracoes/i }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("linkgov.demo-state") || "{}");
      expect(stored.profiles.find((profile: { id: string }) => profile.id === "prf_educacao")?.title).toBe(
        "Portal Municipal de Educacao"
      );
    });

    const stored = JSON.parse(localStorage.getItem("linkgov.demo-state") || "{}");
    expect(stored.profiles.find((profile: { id: string }) => profile.id === "prf_educacao")?.title).toBe(
      "Portal Municipal de Educacao"
    );
    expect(stored.profiles.find((profile: { id: string }) => profile.id === "prf_saude")?.title).toMatch(
      /secretaria municipal de saude/i
    );
  });
});
