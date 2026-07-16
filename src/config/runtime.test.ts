import { describe, expect, it } from "vitest";
import { isDemoFallbackEnabled, resolveFrontendAuthProvider } from "./runtime";

describe("frontend demo fallback policy", () => {
  it("requires local mode, an explicit flag and an operator-supplied password", () => {
    expect(isDemoFallbackEnabled("development", true, "true", "local-secret", "local")).toBe(true);
    expect(isDemoFallbackEnabled("test", true, "true", "test-secret", "local")).toBe(true);
    expect(isDemoFallbackEnabled("development", true, "false", "local-secret", "local")).toBe(false);
    expect(isDemoFallbackEnabled("development", true, "true", "", "local")).toBe(false);
    expect(isDemoFallbackEnabled("development", true, "true", "   ", "local")).toBe(false);
    expect(isDemoFallbackEnabled("development", true, "true", "local-secret", "access")).toBe(false);
  });

  it("disables the demo fallback for production-like builds", () => {
    expect(isDemoFallbackEnabled("production", false, "true", "local-secret", "local")).toBe(false);
    expect(isDemoFallbackEnabled("staging", false, "true", "local-secret", "local")).toBe(false);
    expect(isDemoFallbackEnabled("worker-production", false, "true", "local-secret", "local")).toBe(false);
    expect(isDemoFallbackEnabled("development", false, "true", "local-secret", "local")).toBe(false);
    expect(isDemoFallbackEnabled("test", false, "true", "local-secret", "local")).toBe(false);
  });

  it("defaults production to Cloudflare Access and local development to local auth", () => {
    expect(resolveFrontendAuthProvider("production", false)).toBe("access");
    expect(resolveFrontendAuthProvider("worker-production", false)).toBe("access");
    expect(resolveFrontendAuthProvider("development", true)).toBe("local");
  });

  it("accepts an explicit supported provider only in local runtime modes", () => {
    expect(resolveFrontendAuthProvider("production", false, "local")).toBe("access");
    expect(resolveFrontendAuthProvider("development", false, "local")).toBe("access");
    expect(resolveFrontendAuthProvider("development", true, "ACCESS")).toBe("access");
    expect(resolveFrontendAuthProvider("development", true, "local")).toBe("local");
  });
});
