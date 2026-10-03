import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The core package is used from source, so `pnpm dev` needs no prior build.
const core = fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url));
const fixtures = fileURLToPath(new URL("../../fixtures", import.meta.url));

// The version is set in one place: "version" in the root package.json. The app shows it (About tab, page title).
const version = (JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as { version: string }).version;
const builtOn = new Date().toISOString().slice(0, 10);

export default defineConfig({
  plugins: [
    react(),
    { name: "app-version-in-html", transformIndexHtml: (html: string) => html.replaceAll("%APP_VERSION%", version) },
  ],
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_DATE__: JSON.stringify(builtOn) },
  // Relative asset paths, so the built site works from any folder (GitHub Pages, a file share).
  base: "./",
  resolve: { alias: { "@schedulizer/core": core, "@fixtures": fixtures } },
  server: { port: 5174, fs: { allow: ["../.."] } },
  build: {
    outDir: "dist",
    sourcemap: false,
    // redirect.html is the page Microsoft's sign-in window returns to.
    rollupOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), redirect: fileURLToPath(new URL("redirect.html", import.meta.url)) } },
  },
});
