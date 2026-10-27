import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev` (app) + `npm run dev:worker` (API en :8787) en paralelo.
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "dist", sourcemap: false },
});
