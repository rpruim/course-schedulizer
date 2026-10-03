// Writes the example workbooks in apps/web/public/examples/ (see apps/web/src/exampleBuilders.ts).
// Run with `pnpm examples`; commit the result. examples.yml in the same folder lists what the app offers.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const { createServer } = await import(pathToFileURL(web + "node_modules/vite/dist/node/index.js").href);

// Vite resolves the app's aliases (@schedulizer/core from source, @fixtures, ?raw imports).
const server = await createServer({ root: web, configFile: web + "vite.config.ts", server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { writeWorkbook } = await server.ssrLoadModule("@schedulizer/core");
  const { EXAMPLE_FILES } = await server.ssrLoadModule("/src/exampleBuilders.ts");
  const out = web + "public/examples/";
  mkdirSync(out, { recursive: true });
  for (const [name, build] of Object.entries(EXAMPLE_FILES)) {
    const bytes = await writeWorkbook(build().schedule);
    writeFileSync(out + name + ".xlsx", bytes);
    console.log(`wrote public/examples/${name}.xlsx (${bytes.length} bytes)`);
  }
} finally {
  await server.close();
}
