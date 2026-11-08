import type { DocumentAnalysis, Draft, DraftKind } from "../types.js";
import { analyseHeuristically } from "./heuristic.js";
import { draftFromTemplate } from "./templates.js";
import { analyseWithClaude, draftWithClaude, transcribeWithClaude } from "./claude.js";

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface AiEngine {
  readonly name: "claude" | "heuristic";
  /** Returns text extracted from the file plus the analysis. */
  analyse(
    input: { text?: string; file?: { data: Buffer; mimeType: string }; extraPages?: { data: Buffer; mimeType: string }[] },
    now?: Date,
  ): Promise<{ text: string; analysis: DocumentAnalysis }>;
  draft(kind: DraftKind, text: string, analysis: DocumentAnalysis, senderName: string, note?: string): Promise<Draft>;
}

async function pdfText(data: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

const isImage = (m: string): m is ImageType => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(m);

export class UnreadableDocumentError extends Error {}

export const heuristicEngine: AiEngine = {
  name: "heuristic",
  async analyse({ text, file }, now) {
    let body = text ?? "";
    if (file?.mimeType === "application/pdf") body = `${await pdfText(file.data)}\n${body}`;
    else if (file && isImage(file.mimeType) && !body.trim()) {
      throw new UnreadableDocumentError(
        "Reading photos needs the AI engine (set ANTHROPIC_API_KEY). For now, paste the text of the letter instead.",
      );
    }
    if (!body.trim()) throw new UnreadableDocumentError("We couldn't find any text in that document.");
    return { text: body, analysis: analyseHeuristically(body, now) };
  },
  async draft(kind, text, analysis, senderName, note) {
    return draftFromTemplate(kind, analysis, senderName, note);
  },
};

export const claudeEngine: AiEngine = {
  name: "claude",
  async analyse({ text, file, extraPages }, now) {
    if (file && (file.mimeType === "application/pdf" || isImage(file.mimeType))) {
      const pages = [file, ...(extraPages ?? [])].filter((p) => isImage(p.mimeType)).map((p) => ({ mediaType: p.mimeType as ImageType, data: p.data }));
      const input = file.mimeType === "application/pdf" ? ({ kind: "pdf", data: file.data } as const) : ({ kind: "image", images: pages } as const);
      // Keep a text copy for drafting/search: cheap for PDFs, a transcription call for photos.
      const extracted = file.mimeType === "application/pdf" ? await pdfText(file.data).catch(() => "") : "";
      const [analysis, transcript] = await Promise.all([
        analyseWithClaude(input, now),
        extracted.trim() ? Promise.resolve(extracted) : transcribeWithClaude(input),
      ]);
      return { text: [transcript, text].filter(Boolean).join("\n"), analysis };
    }
    if (!text?.trim()) throw new UnreadableDocumentError("We couldn't find any text in that document.");
    return { text, analysis: await analyseWithClaude({ kind: "text", text }, now) };
  },
  async draft(kind, text, analysis, senderName, note) {
    return draftWithClaude(kind, text, analysis, senderName, note);
  },
};

/**
 * Claude when credentials are configured, with the rule-based engine as a
 * fallback if the API call fails, so a capture never gets lost.
 */
export function createEngine(): AiEngine {
  const wantClaude =
    process.env.AI_ENGINE === "claude" ||
    (process.env.AI_ENGINE !== "heuristic" && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN));
  if (!wantClaude) return heuristicEngine;
  return {
    name: "claude",
    async analyse(input, now) {
      try {
        return await claudeEngine.analyse(input, now);
      } catch (err) {
        if (err instanceof UnreadableDocumentError) throw err;
        console.error("[ai] Claude analysis failed, using heuristic engine:", (err as Error).message);
        return heuristicEngine.analyse(input, now);
      }
    },
    async draft(...args) {
      try {
        return await claudeEngine.draft(...args);
      } catch (err) {
        console.error("[ai] Claude drafting failed, using template:", (err as Error).message);
        return heuristicEngine.draft(...args);
      }
    },
  };
}
