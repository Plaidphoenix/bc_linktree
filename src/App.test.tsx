import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { seedLinks, seedProfiles, seedState, seedUsers } from "./data/seed";

describe("App critical flows", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/");
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
