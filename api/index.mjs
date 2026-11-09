// Vercel serverless function: every /api/* request is routed here (see vercel.json).
// The server is compiled to server/dist by the build command first.
import { createVercelApp } from "../server/dist/vercel.js";

const appPromise = createVercelApp();

export default async function handler(req, res) {
  const app = await appPromise;
  return app(req, res);
}
