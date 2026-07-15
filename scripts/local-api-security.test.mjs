import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hashSessionToken,
  isAllowedLocalOrigin,
  synchronizeSeedAuthentication
} from "./local-api-security.mjs";

let child;
let port;
let baseUrl;

beforeAll(async () => {
  port = await reserveFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(
    process.execPath,
    [resolve(process.cwd(), "scripts/local-api.mjs"), "--host", "127.0.0.1", "--port", String(port)],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error("Local API did not start for its security regression test.");
});

async function reserveFreePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const availablePort = typeof address === "object" && address ? address.port : 0;
  probe.close();
  await once(probe, "close");
  return availablePort;
}

afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
});

describe("local API security boundary", () => {
  it("allows only the expected loopback frontend origins", () => {
    expect(isAllowedLocalOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost:4173")).toBe(true);
    expect(isAllowedLocalOrigin("https://attacker.example")).toBe(false);
    expect(isAllowedLocalOrigin("http://192.0.2.10:5173")).toBe(false);
  });

  it("stores a one-way representation instead of a raw local bearer", () => {
    const token = "synthetic-session-token";
    expect(hashSessionToken(token)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("invalidates seeded sessions whenever local seed credentials change", () => {
    const db = {
      users: [
        { id: "usr_admin", passwordHash: "legacy" },
        { id: "custom-user", passwordHash: "custom" }
      ],
      sessions: [
        { userId: "usr_admin", tokenHash: "seed-session" },
        { userId: "custom-user", tokenHash: "custom-session" }
      ]
    };

    expect(synchronizeSeedAuthentication(db, "disabled")).toBe(true);
    expect(db.users[0].passwordHash).toBe("disabled");
    expect(db.sessions).toEqual([{ userId: "custom-user", tokenHash: "custom-session" }]);
  });

  it("rejects untrusted browser origins before processing a request", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: "{}"
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("returns credentialed CORS only to the local frontend", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:5173", "Access-Control-Request-Method": "GET" }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
});
