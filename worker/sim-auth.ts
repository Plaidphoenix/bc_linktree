import { decodeJwt, type JWTPayload } from "jose";

export type SimAuthBindings = {
  ENVIRONMENT?: string;
  SIM_API_BASE_URL?: string;
  SIM_LOGIN_PATH?: string;
  SIM_VALIDATE_PATH?: string;
  SIM_LOGOUT_PATH?: string;
  SIM_LOGIN_CONTENT_TYPE?: string;
  SIM_SUBJECT_CLAIM?: string;
  SIM_TOKEN_ENCRYPTION_KEY?: string;
  SIM_REQUEST_TIMEOUT_MS?: string;
  SIM_SESSION_TTL_SECONDS?: string;
};

export type SimIdentity = {
  subject: string;
};

export class SimAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 502 | 503,
    public code: "invalid_credentials" | "invalid_token" | "misconfigured" | "unavailable"
  ) {
    super(message);
    this.name = "SimAuthError";
  }
}

export async function authenticateSimCredentials(
  env: SimAuthBindings,
  identifier: string,
  password: string,
  fetchImpl: typeof fetch = fetch
) {
  const endpoint = simEndpoint(env, env.SIM_LOGIN_PATH, "api/login");
  const contentType = String(env.SIM_LOGIN_CONTENT_TYPE || "json").trim().toLowerCase();
  const payload = { user: identifier, pass: password, client: "web" };
  const body =
    contentType === "form"
      ? new URLSearchParams(payload)
      : JSON.stringify(payload);

  const response = await simFetch(
    env,
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type":
          contentType === "form"
            ? "application/x-www-form-urlencoded;charset=UTF-8"
            : "application/json",
        Accept: "application/json"
      },
      body
    },
    fetchImpl
  );
  const result = await readJsonObject(response);
  const token = stringValue(result.jwt) || stringValue(result.token);

  if (!response.ok || result.sucesso === false || result.success === false || !token) {
    throw new SimAuthError("Usuario ou senha invalidos.", 401, "invalid_credentials");
  }

  await validateSimToken(env, token, fetchImpl);
  return {
    token,
    identity: extractSimIdentity(env, token)
  };
}

export async function validateSimToken(
  env: SimAuthBindings,
  token: string,
  fetchImpl: typeof fetch = fetch
) {
  const response = await simFetch(
    env,
    simEndpoint(env, env.SIM_VALIDATE_PATH, "api/validar-acesso"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    },
    fetchImpl
  );
  const result = await readJsonObject(response);

  if (!response.ok || result.sucesso === false || result.success === false || result.valido === false) {
    throw new SimAuthError("Sessao institucional invalida ou expirada.", 401, "invalid_token");
  }
}

export async function logoutSimToken(
  env: SimAuthBindings,
  token: string,
  fetchImpl: typeof fetch = fetch
) {
  const response = await simFetch(
    env,
    simEndpoint(env, env.SIM_LOGOUT_PATH, "api/logout"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    },
    fetchImpl
  );

  if (!response.ok) {
    throw new SimAuthError("Nao foi possivel encerrar a sessao institucional.", 502, "unavailable");
  }
}

export function extractSimIdentity(env: SimAuthBindings, token: string): SimIdentity {
  let payload: JWTPayload;
  try {
    payload = decodeJwt(token);
  } catch {
    throw new SimAuthError("Resposta de autenticacao institucional invalida.", 502, "invalid_token");
  }

  const claimName = safeClaimName(env.SIM_SUBJECT_CLAIM) || "ref_cod_usuario";
  const subject = stringValue(payload[claimName]);
  if (!subject || subject.length > 160) {
    throw new SimAuthError(
      "A identidade institucional nao possui o identificador esperado.",
      502,
      "invalid_token"
    );
  }

  return { subject };
}

export async function encryptSimToken(env: SimAuthBindings, token: string) {
  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSimToken(env: SimAuthBindings, value: string) {
  const [version, ivValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) {
    throw new SimAuthError("Sessao institucional corrompida.", 503, "misconfigured");
  }

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivValue) },
      await importEncryptionKey(env),
      fromBase64Url(encryptedValue)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new SimAuthError("Nao foi possivel abrir a sessao institucional.", 503, "misconfigured");
  }
}

export function simSessionTtlSeconds(env: SimAuthBindings) {
  const configured = Number(env.SIM_SESSION_TTL_SECONDS || 3600);
  if (!Number.isFinite(configured)) {
    return 3600;
  }
  return Math.max(300, Math.min(8 * 60 * 60, Math.round(configured)));
}

export function isSimConfigured(env: SimAuthBindings) {
  try {
    simEndpoint(env, env.SIM_LOGIN_PATH, "api/login");
    decodeEncryptionKey(env.SIM_TOKEN_ENCRYPTION_KEY);
    return true;
  } catch {
    return false;
  }
}

function simEndpoint(env: SimAuthBindings, configuredPath: string | undefined, fallbackPath: string) {
  const base = String(env.SIM_API_BASE_URL || "").trim();
  if (!base) {
    throw new SimAuthError("Integracao com o SIM nao configurada.", 503, "misconfigured");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
  } catch {
    throw new SimAuthError("Endereco da API institucional invalido.", 503, "misconfigured");
  }

  const environment = String(env.ENVIRONMENT || "").trim().toLowerCase();
  const local = environment === "local" || environment === "development" || environment === "test";
  if (baseUrl.protocol !== "https:" && !(local && isLoopback(baseUrl.hostname))) {
    throw new SimAuthError("A API institucional deve usar HTTPS.", 503, "misconfigured");
  }

  const path = String(configuredPath || fallbackPath)
    .trim()
    .replace(/^\/+/, "");
  return new URL(path, baseUrl).toString();
}

async function simFetch(
  env: SimAuthBindings,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch
) {
  const configuredTimeout = Number(env.SIM_REQUEST_TIMEOUT_MS || 8000);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(1000, Math.min(30000, Math.round(configuredTimeout)))
    : 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
  } catch {
    throw new SimAuthError("Servico de identidade temporariamente indisponivel.", 503, "unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {};
  }

  const value = await response.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function importEncryptionKey(env: SimAuthBindings) {
  return crypto.subtle.importKey(
    "raw",
    decodeEncryptionKey(env.SIM_TOKEN_ENCRYPTION_KEY),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
}

function decodeEncryptionKey(value: string | undefined) {
  const key = fromBase64Url(String(value || "").trim());
  if (key.byteLength !== 32) {
    throw new SimAuthError(
      "SIM_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em base64url.",
      503,
      "misconfigured"
    );
  }
  return key;
}

function toBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return new Uint8Array();
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function safeClaimName(value: unknown) {
  const name = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(name) ? name : "";
}

function isLoopback(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}
