import { describe, expect, it } from "vitest";
import { isDemoFallbackEnabled, resolveFrontendAuthProvider } from "./runtime";

describe("frontend demo fallback policy", () => {
  it("allows the demo fallback only while developing or testing", () => {
    expect(isDemoFallbackEnabled("development")).toBe(true);
    expect(isDemoFallbackEnabled("test")).toBe(true);
  });

  it("disables the demo fallback for production-like builds", () => {
    expect(isDemoFallbackEnabled("production")).toBe(false);
    expect(isDemoFallbackEnabled("staging")).toBe(false);
  });

  it("defaults production to Cloudflare Access and local development to local auth", () => {
    expect(resolveFrontendAuthProvider("production")).toBe("access");
    expect(resolveFrontendAuthProvider("development")).toBe("local");
  });

  it("accepts an explicit supported provider", () => {
    expect(resolveFrontendAuthProvider("production", "local")).toBe("local");
    expect(resolveFrontendAuthProvider("development", "ACCESS")).toBe("access");
  });
});
