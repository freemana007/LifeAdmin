import type { DocumentAnalysis, Draft, DraftKind } from "../types.js";

function refLine(a: DocumentAnalysis) {
  const r = a.referenceNumbers[0];
  return r ? `${r.label}: ${r.value}` : "Account/reference number: [add your reference]";
}

/** Offline drafts used when the AI engine is unavailable. */
export function draftFromTemplate(kind: DraftKind, a: DocumentAnalysis, sender: string, note?: string): Draft {
  const provider = a.provider ?? "[provider]";
  const extra = note ? `\n${note}\n` : "";
  const bodies: Record<DraftKind, { subject: string; body: string }> = {
    cancel: {
      subject: `Cancellation request – ${refLine(a)}`,
      body: `Dear ${provider},\n\nPlease cancel my ${a.docType === "renewal" ? "policy/contract and do not renew it" : "account/service"} with effect from the earliest date allowed under my terms.\n\n${refLine(a)}\n${extra}\nPlease confirm the cancellation in writing, along with the date of any final bill or refund, and stop any direct debits after that date.\n\nKind regards,\n${sender}`,
    },
    reply: {
      subject: `Re: ${a.title} – ${refLine(a)}`,
      body: `Dear ${provider},\n\nThank you for your letter regarding ${a.title.toLowerCase()}.\n\n${refLine(a)}\n${extra}\n[Write your response here.]\n\nKind regards,\n${sender}`,
    },
    complaint: {
      subject: `Formal complaint – ${refLine(a)}`,
      body: `Dear ${provider},\n\nI wish to make a formal complaint about ${a.title.toLowerCase()}.\n\n${refLine(a)}\n${extra || "\n[Describe what went wrong.]\n"}\nI would like this resolved within 14 days. If it is not, I will escalate the matter to the relevant ombudsman or regulator.\n\nPlease acknowledge this complaint and give me a reference number.\n\nKind regards,\n${sender}`,
    },
    negotiate: {
      subject: `Renewal quote – ${refLine(a)}`,
      body: `Dear ${provider},\n\nI have received my renewal${a.amountDue ? ` of ${a.amountDue.currency === "GBP" ? "£" : "€"}${a.amountDue.value.toFixed(2)}` : ""} and I am comparing quotes before deciding whether to stay.\n\n${refLine(a)}\n${extra}\nAs an existing customer, I'd like to know the best price you can offer, including any discounts available to new customers. Please reply before my renewal date.\n\nKind regards,\n${sender}`,
    },
  };
  return { kind, ...bodies[kind], to: null, engine: "heuristic" };
}
