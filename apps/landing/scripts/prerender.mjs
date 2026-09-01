// Bakes the app's markup into dist/index.html after the client build, so
// the landing page reads with JavaScript disabled: content visible, motion
// absent. The SSR bundle is built into node_modules/.prerender (a throwaway,
// outside dist and outside lint) by the build script just before this runs.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const here = import.meta.dirname;
const bundle = join(here, "..", "node_modules", ".prerender", "prerender.js");
const index = join(here, "..", "dist", "index.html");
const MARKER = '<div id="root"></div>';

const { render } = await import(pathToFileURL(bundle).href);
const html = await readFile(index, "utf8");
if (!html.includes(MARKER)) {
  console.error("prerender: root marker not found in dist/index.html");
  process.exit(1);
}
const baked = html.replace(MARKER, `<div id="root">${render()}</div>`);
await writeFile(index, baked);
console.log("prerender: markup baked into dist/index.html");
