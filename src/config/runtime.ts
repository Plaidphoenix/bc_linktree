export function isDemoFallbackEnabled(mode: string) {
  return mode === "development" || mode === "test";
}

export type FrontendAuthProvider = "local" | "access";

export function resolveFrontendAuthProvider(mode: string, value?: string): FrontendAuthProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "local" || normalized === "access") {
    return normalized;
  }

  return isDemoFallbackEnabled(mode) ? "local" : "access";
}

function normalizeApiBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, "") || "";
  return normalized || null;
}

export const runtimeConfig = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  demoFallbackEnabled: isDemoFallbackEnabled(import.meta.env.MODE),
  authProvider: resolveFrontendAuthProvider(import.meta.env.MODE, import.meta.env.VITE_AUTH_PROVIDER)
};
