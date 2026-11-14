// Netlify Function: every /api/* request comes here (see the redirect in netlify.toml).
// The server is compiled to server/dist by the build command first.
//
// The Express app runs on a private local port inside the function, and each
// request is passed to it unchanged. This keeps uploads, streaming bodies and
// headers exactly as Express expects them, with no Lambda translation layer.
import http from "node:http";
import { createServerlessApp } from "../../server/dist/serverless.js";

let origin = null;

function start() {
  return (async () => {
    const app = await createServerlessApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}`;
  })();
}

// Hop-by-hop headers, and ones fetch recomputes.
const DROP = ["host", "connection", "content-length", "transfer-encoding", "keep-alive", "content-encoding"];

export default async function handler(req) {
  origin ??= start();
  let base;
  try {
    base = await origin;
  } catch (err) {
    origin = null; // try again on the next request
    console.error("[life-admin] start-up failed:", err);
    return Response.json({ error: "The app couldn't start. Please try again in a moment." }, { status: 503 });
  }
  const url = new URL(req.url);
  // Reached via the /api/* rewrite or directly: either way Express sees /api/...
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "/api");
  const headers = new Headers(req.headers);
  for (const h of DROP) headers.delete(h);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const res = await fetch(base + path + url.search, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
  });
  const out = new Headers(res.headers);
  for (const h of DROP) out.delete(h);
  return new Response(req.method === "HEAD" ? null : res.body, { status: res.status, statusText: res.statusText, headers: out });
}
