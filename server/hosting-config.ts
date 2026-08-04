import { readFileSync } from "node:fs";
import type { ServerOptions } from "node:https";

type Environment = Record<string, string | undefined>;

export function loadTlsServerOptions(
  environment: Environment = process.env
): ServerOptions | undefined {
  const pfxFile = optionalValue(environment.TLS_PFX_FILE);
  const passphraseFile = optionalValue(environment.TLS_PFX_PASSPHRASE_FILE);
  const certificateFile = optionalValue(environment.TLS_CERT_FILE);
  const keyFile = optionalValue(environment.TLS_KEY_FILE);

  if (pfxFile && (certificateFile || keyFile)) {
    throw new Error("Configure TLS com PFX ou com CERT/KEY, nunca com os dois formatos.");
  }
  if (passphraseFile && !pfxFile) {
    throw new Error("TLS_PFX_PASSPHRASE_FILE exige TLS_PFX_FILE.");
  }

  if (pfxFile) {
    const options: ServerOptions = { pfx: readProtectedFile(pfxFile, "TLS_PFX_FILE") };
    if (passphraseFile) {
      const passphrase = readProtectedFile(passphraseFile, "TLS_PFX_PASSPHRASE_FILE")
        .toString("utf8")
        .trim();
      if (!passphrase) {
        throw new Error("O arquivo de senha do certificado TLS esta vazio.");
      }
      options.passphrase = passphrase;
    }
    return options;
  }

  if (certificateFile || keyFile) {
    if (!certificateFile || !keyFile) {
      throw new Error("TLS_CERT_FILE e TLS_KEY_FILE devem ser configurados juntos.");
    }
    return {
      cert: readProtectedFile(certificateFile, "TLS_CERT_FILE"),
      key: readProtectedFile(keyFile, "TLS_KEY_FILE")
    };
  }

  return undefined;
}

export function assertSecureHostingConfiguration(input: {
  appBaseUrl: string;
  environment: string;
  hostname: string;
  tlsEnabled: boolean;
  httpsTerminatedUpstream: boolean;
}) {
  const production = !["development", "local", "test"].includes(input.environment.toLowerCase());
  if (!production) {
    return;
  }

  let publicUrl: URL;
  try {
    publicUrl = new URL(input.appBaseUrl);
  } catch {
    throw new Error("APP_BASE_URL deve ser uma URL publica valida.");
  }

  if (publicUrl.protocol !== "https:") {
    throw new Error("APP_BASE_URL deve usar HTTPS fora do ambiente de desenvolvimento.");
  }

  const externalBinding = !isLoopbackHost(input.hostname);
  if (externalBinding && !input.tlsEnabled && !input.httpsTerminatedUpstream) {
    throw new Error(
      "Um host acessivel pela rede exige TLS local ou HTTPS_TERMINATED_UPSTREAM=true."
    );
  }
}

export function booleanEnvironment(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(optionalValue(value).toLowerCase());
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function readProtectedFile(fileName: string, setting: string) {
  try {
    const value = readFileSync(fileName);
    if (!value.length) {
      throw new Error("empty file");
    }
    return value;
  } catch {
    throw new Error(`Nao foi possivel ler o arquivo protegido configurado em ${setting}.`);
  }
}

function optionalValue(value: string | undefined) {
  return String(value || "").trim();
}
