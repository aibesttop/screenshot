import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Relative base so asset URLs in index.html work under file:// after
  // electron-builder packages the renderer. Without this, Vite emits
  // `/assets/...` which 404s when loaded from inside app.asar.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true,
  },
});
