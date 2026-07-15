import { describe, expect, it } from "vitest";
import { isSafeHttpUrl } from "../../../../src/services/api";

describe("public-safe URL scheme evidence", () => {
  it("shows that URL parsing alone recognizes a non-HTTP scheme", () => {
    const parsed = new URL("javascript:synthetic");
    expect(parsed.protocol).toBe("javascript:");
  });

  it("verifies the application allowlist rejects non-HTTP schemes", () => {
    expect(isSafeHttpUrl("https://example.gov.br/service")).toBe(true);
    expect(isSafeHttpUrl("javascript:synthetic")).toBe(false);
    expect(isSafeHttpUrl("data:text/plain,synthetic")).toBe(false);
  });
});

