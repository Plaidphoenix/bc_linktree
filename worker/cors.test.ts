import { describe, expect, it } from "vitest";
import app from "./index";

const corsEnv = {
  ENVIRONMENT: "production",
  APP_BASE_URL: "https://links.example.gov.br"
};

describe("worker CORS policy", () => {
  it("rejects preflight requests from origins outside the configured frontend", async () => {
    const response = await app.request(
      "https://api.example.gov.br/api/health",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://attacker.example",
          "Access-Control-Request-Method": "GET"
        }
      },
      corsEnv
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("allows the configured frontend origin with credentials", async () => {
    const response = await app.request(
      "https://api.example.gov.br/api/health",
      {
        method: "OPTIONS",
        headers: {
          Origin: corsEnv.APP_BASE_URL,
          "Access-Control-Request-Method": "GET"
        }
      },
      corsEnv
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(corsEnv.APP_BASE_URL);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("rejects a simple cross-origin state-changing request before authentication", async () => {
    const response = await app.request(
      "https://api.example.gov.br/api/auth/logout",
      {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "text/plain"
        },
        body: "{}"
      },
      corsEnv
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});
