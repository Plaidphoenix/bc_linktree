import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const workerProduction = mode === "worker-production";
  const environmentDefines: Record<string, string> = {};

  if (command === "build") {
    environmentDefines["import.meta.env.VITE_ENABLE_DEMO_FALLBACK"] = JSON.stringify("false");
    environmentDefines["import.meta.env.VITE_DEMO_PASSWORD"] = JSON.stringify("");
  }

  if (workerProduction) {
    environmentDefines["import.meta.env.VITE_API_BASE_URL"] = JSON.stringify("");
    environmentDefines["import.meta.env.VITE_AUTH_PROVIDER"] = JSON.stringify("access");
  }

  return {
    plugins: [react()],
    define: Object.keys(environmentDefines).length ? environmentDefines : undefined,
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true
        }
      }
    },
    build: {
      sourcemap: false
    },
    test: {
      environment: "jsdom",
      globals: true,
      env: {
        VITE_AUTH_PROVIDER: "local",
        VITE_ENABLE_DEMO_FALLBACK: "true",
        VITE_DEMO_PASSWORD: "synthetic-test-password"
      },
      setupFiles: ["src/test/setup.ts"],
      css: true
    }
  };
});
