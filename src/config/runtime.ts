export function isDemoFallbackEnabled(mode: string) {
  return mode === "development" || mode === "test";
}

export type FrontendAuthProvider = "local" | "access" | "sim";

export function resolveFrontendAuthProvider(mode: string, value?: string): FrontendAuthProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "local" || normalized === "access" || normalized === "sim") {
    return normalized;
  }

  return isDemoFallbackEnabled(mode) ? "local" : "access";
}

function normalizeApiBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, "") || "";
  return normalized || null;
}

function normalizeExternalUrl(value: string | undefined) {
  try {
    const url = new URL(value?.trim() || "");
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function usesManagedSession(provider: FrontendAuthProvider) {
  return provider === "access" || provider === "sim";
}

export const runtimeConfig = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  demoFallbackEnabled: isDemoFallbackEnabled(import.meta.env.MODE),
  authProvider: resolveFrontendAuthProvider(import.meta.env.MODE, import.meta.env.VITE_AUTH_PROVIDER),
  simPasswordResetUrl: normalizeExternalUrl(import.meta.env.VITE_SIM_PASSWORD_RESET_URL)
};
