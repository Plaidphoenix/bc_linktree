import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "./id";

describe("createId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a prefixed UUID-compatible id without requiring crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(7);
        return bytes;
      }
    });

    expect(createId("tmp")).toMatch(/^tmp_[0-9a-f-]{36}$/);
  });
});
