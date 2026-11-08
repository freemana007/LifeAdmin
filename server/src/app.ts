import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { UnreadableDocumentError, type AiEngine } from "./ai/index.js";
import { draftFromTemplate } from "./ai/templates.js";
import { parseInboundEmail } from "./email.js";
import { deadlinesToIcs, dueReminders } from "./reminders.js";
import {
  createUser,
  docsThisMonth,
  FREE_DOCS_PER_MONTH,
  ingestDocument,
  seedExamples,
  memberName,
  NotFoundError,
  publicUser,
  QuotaError,
} from "./service.js";
import type { Store } from "./store.js";
import { DEADLINE_KINDS, DRAFT_KINDS, type User } from "./types.js";
import { todayIso } from "./util.js";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain"];

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export interface AppOptions {
  store: Store;
  ai: AiEngine;
  /** Shared secret the email provider sends in the X-Inbound-Secret header. */
  inboundSecret?: string;
  /** Directory with the built web app, served at /. */
  webDist?: string;
  now?: () => Date;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Wrap async handlers so rejections reach the error middleware.
const h =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

export function createApp({ store, ai, inboundSecret, webDist, now = () => new Date() }: AppOptions) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, ACCEPTED.includes(file.mimetype)),
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "30mb" }));

  const auth = (req: Request, _res: Response, next: NextFunction) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const user = token ? store.data.users.find((u) => u.token === token) : undefined;
    if (!user) return next(new HttpError(401, "Please sign in."));
    req.user = user;
    next();
  };

  const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
    const r = schema.safeParse(data);
    if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return r.data;
  };

  const docView = (id: string, householdId: string) => {
    const doc = store.data.documents.find((d) => d.id === id && d.householdId === householdId);
    if (!doc) throw new HttpError(404, "Document not found.");
    return doc;
  };

  const deadlineView = (d: (typeof store.data.deadlines)[number]) => ({
    ...d,
    ownerName: memberName(store, d.ownerId),
    document: (() => {
      const doc = store.data.documents.find((x) => x.id === d.documentId);
      return doc ? { id: doc.id, title: doc.analysis.title, docType: doc.analysis.docType, provider: doc.analysis.provider } : null;
    })(),
  });

  // ---------- Health ----------
  app.get("/api/health", (_req, res) => res.json({ ok: true, ai: ai.name }));

  // ---------- Accounts & household ----------
  app.post(
    "/api/signup",
    h(async (req, res) => {
      // Only a name is needed to start (gradual engagement); email can be added later for reminders.
      const body = parse(
        z.object({
          name: z.string().trim().min(1).max(80),
          email: z.union([z.string().trim().email(), z.literal("")]).optional(),
          inviteCode: z.string().optional(),
          examples: z.boolean().optional(),
        }),
        req.body,
      );
      const email = body.email?.toLowerCase() ?? "";
      if (email && store.data.users.some((u) => u.email === email)) {
        throw new HttpError(409, "There's already an account with that email. Ask the person who set it up for your household's invite code.");
      }
      const user = createUser(store, body.name, email, body.inviteCode || undefined);
      const hasDocs = store.data.documents.some((d) => d.householdId === user.householdId);
      if (body.examples !== false && !hasDocs) await seedExamples(store, user, now());
      res.status(201).json({ token: user.token, user: publicUser(user) });
    }),
  );

  app.get(
    "/api/me",
    auth,
    h((req, res) => {
      const u = req.user!;
      const household = store.data.households.find((x) => x.id === u.householdId)!;
      const members = store.data.users.filter((x) => x.householdId === u.householdId).map((m) => ({ id: m.id, name: m.name, email: m.email }));
      res.json({
        user: publicUser(u),
        household: { ...household, members, docsThisMonth: docsThisMonth(store, household.id, now()), freeLimit: FREE_DOCS_PER_MONTH },
        ai: ai.name,
      });
    }),
  );

  app.patch(
    "/api/me",
    auth,
    h((req, res) => {
      const body = parse(z.object({ email: z.union([z.string().trim().email(), z.literal("")]) }), req.body);
      const email = body.email.toLowerCase();
      if (email && store.data.users.some((u) => u.email === email && u.id !== req.user!.id)) throw new HttpError(409, "That email is already used by another account.");
      store.mutate(() => {
        req.user!.email = email;
      });
      res.json(publicUser(req.user!));
    }),
  );

  app.patch(
    "/api/household",
    auth,
    h((req, res) => {
      const body = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), plan: z.enum(["free", "premium"]).optional() }), req.body);
      // NOTE: plan changes would go through a payment provider (Stripe) in production.
      const household = store.mutate((db) => {
        const hh = db.households.find((x) => x.id === req.user!.householdId)!;
        Object.assign(hh, body);
        return hh;
      });
      res.json(household);
    }),
  );

  // ---------- Capture ----------
  app.post(
    "/api/documents",
    auth,
    upload.array("file", 6),
    h(async (req, res) => {
      const text = typeof req.body?.text === "string" ? req.body.text : undefined;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const file = files[0];
      // Further photos are extra pages of the same document.
      const extraPages = files.slice(1).filter((f) => f.mimetype.startsWith("image/")).map((f) => ({ data: f.buffer, mimeType: f.mimetype }));
      if (!file && !text?.trim()) throw new HttpError(400, "Add a photo, a PDF or some text.");
      const source = file ? (file.mimetype === "application/pdf" ? "pdf" : file.mimetype === "text/plain" ? "text" : "photo") : "text";
      const input =
        file?.mimetype === "text/plain"
          ? { text: [file.buffer.toString("utf8"), text].filter(Boolean).join("\n") }
          : { text, file: file ? { data: file.buffer, mimeType: file.mimetype, fileName: file.originalname } : undefined, extraPages };
      const result = await ingestDocument(store, ai, req.user!, source, input, now());
      res.status(201).json({ document: result.document, deadlines: result.deadlines.map(deadlineView) });
    }),
  );

  app.post(
    "/api/inbound/email",
    h(async (req, res) => {
      if (inboundSecret && req.header("x-inbound-secret") !== inboundSecret) throw new HttpError(401, "Bad inbound secret.");
      const email = parseInboundEmail(req.body ?? {});
      const user = store.data.users.find((u) => email.to.some((addr) => addr.split("@")[0] === u.inboxSlug));
      // Reply 200 for unknown recipients so the provider doesn't retry forever.
      if (!user) return res.json({ accepted: false, reason: "unknown recipient" });
      const pdf = email.attachments.find((a) => ACCEPTED.includes(a.mimeType) && a.mimeType !== "text/plain");
      const result = await ingestDocument(
        store,
        ai,
        user,
        "email",
        { text: email.text, file: pdf ? { data: pdf.data, mimeType: pdf.mimeType, fileName: pdf.fileName } : undefined },
        now(),
      );
      res.json({ accepted: true, documentId: result.document.id });
    }),
  );

  // ---------- Documents ----------
  app.get(
    "/api/documents",
    auth,
    h((req, res) => {
      const docs = store.data.documents
        .filter((d) => d.householdId === req.user!.householdId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ text: _text, ...d }) => ({ ...d, uploadedByName: memberName(store, d.uploadedBy) }));
      res.json(docs);
    }),
  );

  app.get(
    "/api/documents/:id",
    auth,
    h((req, res) => {
      const doc = docView(req.params.id as string, req.user!.householdId);
      const deadlines = store.data.deadlines.filter((d) => d.documentId === doc.id).map(deadlineView);
      res.json({ document: { ...doc, uploadedByName: memberName(store, doc.uploadedBy) }, deadlines });
    }),
  );

  app.patch(
    "/api/documents/:id",
    auth,
    h((req, res) => {
      const body = parse(z.object({ status: z.enum(["needs_review", "confirmed"]).optional(), title: z.string().trim().min(1).max(120).optional() }), req.body);
      const doc = docView(req.params.id as string, req.user!.householdId);
      store.mutate(() => {
        if (body.status) doc.status = body.status;
        if (body.title) doc.analysis.title = body.title;
        if (body.status === "confirmed") {
          for (const d of store.data.deadlines.filter((x) => x.documentId === doc.id)) {
            d.date.confirmed = true;
            d.amount.confirmed = true;
          }
        }
      });
      res.json(doc);
    }),
  );

  app.delete(
    "/api/documents/:id",
    auth,
    h((req, res) => {
      const doc = docView(req.params.id as string, req.user!.householdId);
      store.mutate((db) => {
        db.documents = db.documents.filter((d) => d.id !== doc.id);
        const gone = new Set(db.deadlines.filter((d) => d.documentId === doc.id).map((d) => d.id));
        db.deadlines = db.deadlines.filter((d) => !gone.has(d.id));
        db.remindersSent = db.remindersSent.filter((r) => !gone.has(r.deadlineId));
      });
      res.status(204).end();
    }),
  );

  app.post(
    "/api/documents/:id/drafts",
    auth,
    h(async (req, res) => {
      const body = parse(z.object({ kind: z.enum(DRAFT_KINDS), note: z.string().max(2000).optional() }), req.body);
      const household = store.data.households.find((x) => x.id === req.user!.householdId)!;
      const doc = docView(req.params.id as string, req.user!.householdId);
      // AI drafting is a Premium feature; free households get the built-in templates.
      const draft =
        household.plan === "premium"
          ? await ai.draft(body.kind, doc.text, doc.analysis, req.user!.name, body.note)
          : draftFromTemplate(body.kind, doc.analysis, req.user!.name, body.note);
      res.json(draft);
    }),
  );

  // ---------- Timeline ----------
  app.get(
    "/api/timeline",
    auth,
    h((req, res) => {
      const today = todayIso(now());
      const items = store.data.deadlines
        .filter((d) => d.householdId === req.user!.householdId)
        .sort((a, b) => a.date.value.localeCompare(b.date.value))
        .map(deadlineView);
      const open = items.filter((d) => !d.done);
      const sum = (xs: typeof items) =>
        xs.reduce<Record<string, number>>((acc, d) => {
          if (d.amount.value != null) acc[d.currency ?? "EUR"] = (acc[d.currency ?? "EUR"] ?? 0) + d.amount.value;
          return acc;
        }, {});
      const in30 = open.filter((d) => d.date.value >= today && d.date.value <= new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10));
      res.json({
        today,
        items,
        stats: {
          overdue: open.filter((d) => d.date.value < today).length,
          next30Days: in30.length,
          dueNext30Days: sum(in30.filter((d) => d.kind === "payment" || d.kind === "renewal")),
          needsReview: open.filter((d) => !d.date.confirmed).length,
          done: items.length - open.length,
        },
      });
    }),
  );

  app.patch(
    "/api/deadlines/:id",
    auth,
    h((req, res) => {
      const body = parse(
        z.object({
          title: z.string().trim().min(1).max(120).optional(),
          kind: z.enum(DEADLINE_KINDS).optional(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          amount: z.number().nonnegative().nullable().optional(),
          currency: z.enum(["EUR", "GBP"]).optional(),
          ownerId: z.string().nullable().optional(),
          done: z.boolean().optional(),
          confirm: z.boolean().optional(),
        }),
        req.body,
      );
      const d = store.data.deadlines.find((x) => x.id === req.params.id && x.householdId === req.user!.householdId);
      if (!d) throw new HttpError(404, "Deadline not found.");
      if (body.ownerId && !store.data.users.some((u) => u.id === body.ownerId && u.householdId === d.householdId)) {
        throw new HttpError(400, "Owner must be a member of your household.");
      }
      store.mutate((db) => {
        if (body.title !== undefined) d.title = body.title;
        if (body.kind !== undefined) d.kind = body.kind;
        if (body.currency !== undefined) d.currency = body.currency;
        if (body.ownerId !== undefined) d.ownerId = body.ownerId;
        if (body.done !== undefined) d.done = body.done;
        if (body.date !== undefined && body.date !== d.date.value) {
          d.date = { value: body.date, confidence: "high", confirmed: true };
          db.remindersSent = db.remindersSent.filter((r) => r.deadlineId !== d.id);
        }
        if (body.amount !== undefined) d.amount = { value: body.amount, confidence: "high", confirmed: true };
        if (body.confirm) {
          d.date.confirmed = true;
          d.amount.confirmed = true;
        }
      });
      res.json(deadlineView(d));
    }),
  );

  // ---------- Reminders & calendar ----------
  app.get(
    "/api/reminders",
    auth,
    h((req, res) => {
      const due = dueReminders(store.data, now()).filter((r) => r.deadline.householdId === req.user!.householdId);
      res.json(due.map((r) => ({ deadlineId: r.deadline.id, message: r.message, offsetDays: r.offsetDays, recipients: r.recipients.map((u) => u.name) })));
    }),
  );

  app.get(
    "/api/calendar/:token.ics",
    h((req, res) => {
      const user = store.data.users.find((u) => u.calendarToken === req.params.token);
      if (!user) throw new HttpError(404, "Calendar not found.");
      res
        .type("text/calendar")
        .send(deadlinesToIcs(store.data.deadlines.filter((d) => d.householdId === user.householdId), now()));
    }),
  );

  // ---------- Web app ----------
  if (webDist && existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  }

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found.")));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      err instanceof HttpError ? err.status : err instanceof QuotaError ? 402 : err instanceof NotFoundError ? 404 : err instanceof UnreadableDocumentError ? 422 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? "Something went wrong." : err.message });
  });

  return app;
}
