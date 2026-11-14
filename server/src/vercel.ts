/**
 * Builds the app for Vercel (one serverless function serving /api/*).
 * Configuration comes from environment variables; see README "Deploy to Vercel".
 */
import { createServerlessApp } from "./serverless.js";

export const createVercelApp = createServerlessApp;
