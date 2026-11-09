// Runs the app the way Vercel does: static files from web/dist (with the SPA
// fallback from vercel.json) and every /api/* request through api/index.mjs.
// Used by the e2e suite with E2E_VERCEL=1; needs `npm run build` first.
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const dist = join(root, "web/dist");
const { default: handler } = await import(join(root, "api/index.mjs"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

http
  .createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path.startsWith("/api/")) return handler(req, res);
    let file = normalize(join(dist, path));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
    res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  })
  .listen(Number(process.env.PORT ?? 3000), () => console.log(`vercel-local on ${process.env.PORT ?? 3000}`));
