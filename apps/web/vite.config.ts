import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The core package is used from source, so `pnpm dev` needs no prior build.
const core = fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url));
const fixtures = fileURLToPath(new URL("../../fixtures", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site works from any folder (GitHub Pages, a file share).
  base: "./",
  resolve: { alias: { "@schedulizer/core": core, "@fixtures": fixtures } },
  server: { port: 5174, fs: { allow: ["../.."] } },
  build: { outDir: "dist", sourcemap: false },
});
