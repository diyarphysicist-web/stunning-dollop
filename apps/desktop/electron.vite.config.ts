import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Workspace packages ship TypeScript sources, so they are bundled rather than externalised.
const bundled = ["@neuromr/contracts", "@neuromr/ui", "@neuromr/i18n", "zod"];

export default defineConfig({
  main: { build: { externalizeDeps: { exclude: bundled } } },
  // Sandboxed preloads must be CommonJS.
  preload: { build: { externalizeDeps: { exclude: bundled }, rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } } },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    build: { rollupOptions: { input: resolve(import.meta.dirname, "src/renderer/index.html") } },
    plugins: [react()],
    // The locked design (shell.css, icon sprite, LUT CSS) is the stylesheet contract the app uses.
    resolve: { alias: { "@design": resolve(import.meta.dirname, "../../design") } },
    server: { fs: { allow: [resolve(import.meta.dirname, "../..")] } },
  },
});
