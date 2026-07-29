import { afterEach, describe, expect, it, vi } from "vitest";
import app, { type Bindings } from "./index";

describe("operational error redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not expose database error details in the response or console", async () => {
    const sensitiveMarker = "synthetic-person@example.test";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const database = {
      prepare() {
        throw new Error(`database detail contains ${sensitiveMarker}`);
      }
    } as unknown as D1Database;

    const response = await app.request(
      "https://links.example.test/api/profiles/example",
      undefined,
      {
        DB: database,
        ENVIRONMENT: "production",
        AUTH_PROVIDER: "sim",
        APP_BASE_URL: "https://links.example.test"
      } as Bindings
    );
    const body = (await response.json()) as Record<string, unknown>;
    const responseText = JSON.stringify(body);
    const loggedText = JSON.stringify(consoleError.mock.calls);

    expect(response.status).toBe(500);
    expect(body.incidentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(responseText).not.toContain(sensitiveMarker);
    expect(loggedText).not.toContain(sensitiveMarker);
    expect(loggedText).toContain("api.unhandled");
  });
});
