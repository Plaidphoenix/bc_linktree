import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const workerProduction = mode === "worker-production";

  return {
    plugins: [react()],
    define: workerProduction
      ? {
          "import.meta.env.VITE_API_BASE_URL": JSON.stringify(""),
          "import.meta.env.VITE_AUTH_PROVIDER": JSON.stringify("access")
        }
      : undefined,
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true
        }
      }
    },
    build: {
      sourcemap: true
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["src/test/setup.ts"],
      css: true
    }
  };
});
