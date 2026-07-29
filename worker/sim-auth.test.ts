import { describe, expect, it, vi } from "vitest";
import {
  authenticateSimCredentials,
  decryptSimToken,
  encryptSimToken,
  extractSimIdentity,
  SimAuthError,
  validateSimToken,
  type SimAuthBindings
} from "./sim-auth";

const encryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
const env: SimAuthBindings = {
  ENVIRONMENT: "test",
  SIM_API_BASE_URL: "https://identity.example.test/default",
  SIM_TOKEN_ENCRYPTION_KEY: encryptionKey
};

function syntheticToken(payload: Record<string, unknown> = { ref_cod_usuario: 123, nome: "Usuario Sintetico" }) {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.synthetic-signature`;
}

describe("SIM identity adapter", () => {
  it("logs in, validates the returned token and extracts only the configured subject", async () => {
    const token = syntheticToken();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sucesso: true, jwt: token }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(true), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const result = await authenticateSimCredentials(env, "usuario.teste", "senha-sintetica", fetchMock);

    expect(result.identity).toEqual({ subject: "123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      user: "usuario.teste",
      pass: "senha-sintetica",
      client: "mobile"
    });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: `Bearer ${token}`
    });
  });

  it("rejects a bare false response from validar-acesso", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(false), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(validateSimToken(env, syntheticToken(), fetchMock)).rejects.toMatchObject({
      status: 401,
      code: "invalid_token"
    });
  });

  it("logs out the provider token when validation fails", async () => {
    const token = syntheticToken();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sucesso: true, jwt: token }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(false), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sucesso: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    await expect(
      authenticateSimCredentials(env, "usuario.teste", "senha-sintetica", fetchMock)
    ).rejects.toMatchObject({ status: 401, code: "invalid_token" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: `Bearer ${token}`
    });
  });

  it("does not accept a token without the expected subject", async () => {
    const token = syntheticToken({ nome: "Sem identificador" });

    expect(() => extractSimIdentity(env, token)).toThrow(SimAuthError);
  });

  it("encrypts provider tokens before persistence", async () => {
    const encrypted = await encryptSimToken(env, "synthetic-provider-token");

    expect(encrypted).not.toContain("synthetic-provider-token");
    await expect(decryptSimToken(env, encrypted)).resolves.toBe("synthetic-provider-token");
  });

  it("fails closed when the identity service is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));

    await expect(
      authenticateSimCredentials(env, "usuario.teste", "senha-sintetica", fetchMock)
    ).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
});
