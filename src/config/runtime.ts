export type FrontendAuthProvider = "local" | "access";

function isLocalRuntimeMode(mode: string, isDevelopmentRuntime: boolean) {
  return isDevelopmentRuntime && (mode === "development" || mode === "test");
}

export function isDemoFallbackEnabled(
  mode: string,
  isDevelopmentRuntime: boolean,
  enabled: string | undefined,
  password: string | undefined,
  authProvider: FrontendAuthProvider
) {
  return (
    isLocalRuntimeMode(mode, isDevelopmentRuntime) &&
    authProvider === "local" &&
    enabled === "true" &&
    Boolean(password?.trim())
  );
}

export function resolveFrontendAuthProvider(
  mode: string,
  isDevelopmentRuntime: boolean,
  value?: string
): FrontendAuthProvider {
  const normalized = value?.trim().toLowerCase();

  if (!isLocalRuntimeMode(mode, isDevelopmentRuntime)) {
    return "access";
  }

  if (normalized === "local" || normalized === "access") {
    return normalized;
  }

  return "local";
}

function normalizeApiBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, "") || "";
  return normalized || null;
}

const authProvider = resolveFrontendAuthProvider(
  import.meta.env.MODE,
  import.meta.env.DEV,
  import.meta.env.VITE_AUTH_PROVIDER
);

export const runtimeConfig = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  demoFallbackEnabled: isDemoFallbackEnabled(
    import.meta.env.MODE,
    import.meta.env.DEV,
    import.meta.env.VITE_ENABLE_DEMO_FALLBACK,
    import.meta.env.VITE_DEMO_PASSWORD,
    authProvider
  ),
  authProvider
};
