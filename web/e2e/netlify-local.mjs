// Runs the app the way Netlify does: static files from web/dist (with the
// netlify.toml fallback to index.html) and every /api/* request rewritten to
// /.netlify/functions/api/* and handed to netlify/functions/api.mjs as a web
// Request. Used by the e2e suite with E2E_NETLIFY=1; needs `npm run build` first.
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";

const root = process.cwd();
const dist = join(root, "web/dist");
const { default: handler } = await import(join(root, "netlify/functions/api.mjs"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const port = Number(process.env.PORT ?? 8888);

http
  .createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path.startsWith("/api/")) {
      try {
        const url = `http://localhost:${port}${req.url.replace(/^\/api\//, "/.netlify/functions/api/")}`;
        const hasBody = !["GET", "HEAD"].includes(req.method);
        const body = hasBody ? Buffer.concat(await Array.fromAsync(req)) : undefined;
        const out = await handler(new Request(url, { method: req.method, headers: req.headers, body }));
        res.writeHead(out.status, Object.fromEntries(out.headers));
        if (out.body) Readable.fromWeb(out.body).pipe(res);
        else res.end();
      } catch (err) {
        console.error(err);
        res.writeHead(502).end();
      }
      return;
    }
    let file = normalize(join(dist, path));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
    res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  })
  .listen(port, () => console.log(`netlify-local on ${port}`));
