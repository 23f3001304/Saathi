// Zero-dependency static file server for the merchant-ui container: the Vite
// bundle plus an SPA fallback, and nothing else. Same shape as audit-ui's.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "dist");
const port = Number(process.env.PORT ?? 5174);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function resolveFile(url) {
  const safePath = normalize(decodeURIComponent(url)).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  const candidate = join(root, safePath === "/" ? "index.html" : safePath);
  const isFile = (await stat(candidate).catch(() => null))?.isFile();
  return isFile ? candidate : join(root, "index.html"); // SPA fallback
}

/**
 * A merchant supplies image URLs and their listing copy travels through a
 * model into a shopper's browser, so this app renders text and pointers it did
 * not author. The policy is the structural answer to that; `ProductImage`
 * re-checking the scheme is the per-element one, and both are wanted.
 *
 * Set here rather than in `index.html` because a meta tag would also bind the
 * Vite dev server, whose module injection and HMR need inline scripts. The
 * built app needs none of that, so production gets the stricter rule and
 * development is not broken to buy it.
 *
 * `img-src` allows any `https:` host on purpose: that is the merchant imagery
 * feature. `data:` carries the kolam ground and the sandbox's redacted frames.
 * `connect-src` names the gateway, the agent host and Sarvam's speech API,
 * which is the whole of what this app talks to.
 */
const SECURITY = {
  "content-security-policy": [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self' data: blob:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' http://localhost:8787 http://localhost:8788 ws://localhost:8788 https://api.sarvam.ai wss://api.sarvam.ai",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; "),
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

createServer((req, res) => {
  resolveFile(req.url ?? "/")
    .then(async (filePath) => {
      const body = await readFile(filePath);
      res.writeHead(200, {
        ...SECURITY,
        "content-type":
          contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      res.end(body);
    })
    .catch(() => res.writeHead(404).end("not found"));
}).listen(port, () => {
  console.log(`merchant-ui static server listening on :${port}`);
});
