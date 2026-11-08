/**
 * Inbound email parsing. The app gives each person an address like
 * anna-7k3p2q@in.lifeadmin.ie; the mail provider (Postmark, SendGrid,
 * Mailgun, Azure Communication Services…) POSTs each message to
 * /api/inbound/email. We accept the common JSON shapes.
 */
export interface InboundEmail {
  to: string[];
  from: string;
  subject: string;
  text: string;
  attachments: { fileName: string; mimeType: string; data: Buffer }[];
}

function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/&pound;/g, "£")
    .replace(/\n{3,}/g, "\n\n");
}

const asList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .map((x) => (typeof x === "string" ? x : (x as { Email?: string; email?: string })?.Email ?? (x as { email?: string })?.email ?? ""))
    .map((s) => s.match(/<([^>]+)>/)?.[1] ?? s)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function parseInboundEmail(body: Record<string, unknown>): InboundEmail {
  const to = asList(body.To ?? body.to ?? body.recipient ?? body.ToFull);
  const from = String(body.From ?? body.from ?? body.sender ?? "");
  const subject = String(body.Subject ?? body.subject ?? "");
  const textPart = String(body.TextBody ?? body.text ?? body["body-plain"] ?? "");
  const htmlPart = String(body.HtmlBody ?? body.html ?? body["body-html"] ?? "");
  const text = `From: ${from}\nSubject: ${subject}\n\n${textPart.trim() || stripHtml(htmlPart)}`;
  const rawAttachments = (body.Attachments ?? body.attachments ?? []) as Record<string, string>[];
  const attachments = (Array.isArray(rawAttachments) ? rawAttachments : []).flatMap((a) => {
    const data = a.Content ?? a.content;
    if (!data) return [];
    return [{ fileName: a.Name ?? a.filename ?? "attachment", mimeType: a.ContentType ?? a.contentType ?? "application/octet-stream", data: Buffer.from(data, "base64") }];
  });
  return { to, from, subject, text, attachments };
}
