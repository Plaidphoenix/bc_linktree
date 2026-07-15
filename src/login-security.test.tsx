import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("production login presentation", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/login");
    vi.resetModules();
    vi.stubEnv("VITE_ENABLE_DEMO_FALLBACK", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not display or prefill demo credentials", async () => {
    const { App } = await import("./App");
    render(<App />);

    expect(screen.queryByText(/credenciais demo/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail institucional/i)).toHaveValue("");
    expect(screen.getByLabelText(/^senha$/i)).toHaveValue("");
  });
});
