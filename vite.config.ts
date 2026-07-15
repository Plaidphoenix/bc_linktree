import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
      VITE_ENABLE_DEMO_FALLBACK: "true",
      VITE_DEMO_PASSWORD: "synthetic-test-password"
    },
    setupFiles: ["src/test/setup.ts"],
    css: true
  }
});
