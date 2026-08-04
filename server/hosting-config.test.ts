import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSecureHostingConfiguration,
  booleanEnvironment,
  loadTlsServerOptions
} from "./hosting-config";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadTlsServerOptions", () => {
  it("le PFX e senha a partir de arquivos protegidos", () => {
    const directory = temporaryDirectory();
    const pfx = join(directory, "server.pfx");
    const password = join(directory, "server.password");
    writeFileSync(pfx, Buffer.from([1, 2, 3]));
    writeFileSync(password, "senha-sintetica\n");

    const options = loadTlsServerOptions({
      TLS_PFX_FILE: pfx,
      TLS_PFX_PASSPHRASE_FILE: password
    });

    expect(options?.pfx).toEqual(Buffer.from([1, 2, 3]));
    expect(options?.passphrase).toBe("senha-sintetica");
  });

  it("recusa configuracao TLS parcial", () => {
    expect(() => loadTlsServerOptions({ TLS_CERT_FILE: "cert.pem" })).toThrow(
      "TLS_CERT_FILE e TLS_KEY_FILE"
    );
  });
});

describe("assertSecureHostingConfiguration", () => {
  it("recusa host de producao sem terminacao HTTPS", () => {
    expect(() =>
      assertSecureHostingConfiguration({
        appBaseUrl: "https://10.0.0.10:8443",
        environment: "production",
        hostname: "0.0.0.0",
        tlsEnabled: false,
        httpsTerminatedUpstream: false
      })
    ).toThrow("exige TLS local");
  });

  it("aceita TLS direto e proxy HTTPS", () => {
    expect(() =>
      assertSecureHostingConfiguration({
        appBaseUrl: "https://10.0.0.10:8443",
        environment: "production",
        hostname: "0.0.0.0",
        tlsEnabled: true,
        httpsTerminatedUpstream: false
      })
    ).not.toThrow();
    expect(() =>
      assertSecureHostingConfiguration({
        appBaseUrl: "https://links.example.gov.br",
        environment: "production",
        hostname: "0.0.0.0",
        tlsEnabled: false,
        httpsTerminatedUpstream: true
      })
    ).not.toThrow();
  });

  it("recusa URL HTTP em producao", () => {
    expect(() =>
      assertSecureHostingConfiguration({
        appBaseUrl: "http://10.0.0.10:8787",
        environment: "production",
        hostname: "127.0.0.1",
        tlsEnabled: false,
        httpsTerminatedUpstream: false
      })
    ).toThrow("deve usar HTTPS");
  });
});

describe("booleanEnvironment", () => {
  it("aceita somente valores booleanos explicitos", () => {
    expect(booleanEnvironment("true")).toBe(true);
    expect(booleanEnvironment("ON")).toBe(true);
    expect(booleanEnvironment("false")).toBe(false);
    expect(booleanEnvironment(undefined)).toBe(false);
  });
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "linkgov-tls-"));
  temporaryDirectories.push(directory);
  return directory;
}
