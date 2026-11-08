import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:3001" } },
  // The demo is published as a single self-contained page, so fonts and images are inlined.
  build: mode === "demo" ? { assetsInlineLimit: 10_000_000 } : {},
}));
