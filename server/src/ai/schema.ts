import { z } from "zod";
import { DEADLINE_KINDS, DOC_TYPES } from "../types.js";

const confidence = z.enum(["high", "medium", "low"]);

/** What Claude must return for a document. Mirrors DocumentAnalysis minus `engine`. */
export const AnalysisSchema = z.object({
  docType: z.enum(DOC_TYPES),
  docTypeConfidence: confidence,
  title: z.string().describe("Short label, e.g. 'Electric Ireland – electricity bill'"),
  provider: z.string().nullable(),
  summary: z.string().describe("2-3 plain-English sentences: what it is, what to do, by when."),
  actions: z.array(z.string()).describe("Concrete next steps, most urgent first."),
  referenceNumbers: z.array(z.object({ label: z.string(), value: z.string() })),
  amountDue: z
    .object({ value: z.number(), currency: z.string(), confidence, evidence: z.string().nullable().describe("Exact short quote from the document showing the amount") })
    .nullable(),
  renewalTerms: z.string().nullable(),
  deadlines: z.array(
    z.object({
      title: z.string(),
      kind: z.enum(DEADLINE_KINDS),
      date: z.string().describe("ISO date YYYY-MM-DD"),
      amount: z.number().nullable(),
      confidence,
      evidence: z.string().nullable().describe("Exact short quote (under 120 characters) from the document that states this date"),
    }),
  ),
  flags: z.array(z.string()).describe("Things worth acting on, e.g. a price rise or auto-renewal."),
});

export const DraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  to: z.string().nullable().describe("Recipient email address if it appears in the document, else null."),
});
