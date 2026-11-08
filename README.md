# Life Admin

One app that takes the stress out of household admin. Snap a photo, upload a PDF or forward an email. The app explains the document in plain English, pulls out deadlines and money owed, puts them on one timeline, and helps you act on them.

This repository is the **clickable prototype** from the product plan: capture → summary → timeline → act, for Irish and UK households.

## What works

| Plan feature | Prototype |
|---|---|
| **Capture** | Photo (phone camera), PDF/image upload, pasted text, and a personal forwarding address per person (`POST /api/inbound/email` webhook, Postmark/SendGrid/Mailgun JSON shapes) |
| **Understand** | Classifies bill / renewal / tax letter / warranty / contract / official letter / receipt and writes a plain-English summary with next steps |
| **Extract** | Due dates (day-first IE/UK formats), amounts (€/£), reference numbers (account, policy, MPRN, GPRN…), provider, renewal terms, with a **confidence level** on each value |
| **Timeline** | One view of overdue / this week / next 30 days / later, money due in the next 30 days, “check this” badges until a person confirms each value |
| **Reminders** | Reminder schedule per deadline type (renewals 21/7/1 days ahead, payments 7/2/0), plus an iCalendar feed for Google, Outlook and Apple Calendar |
| **Act** | Drafts cancellation, reply, complaint and “better price” emails; flags auto-renewals and price rises |
| **Household** | Shared timeline, invite code, assign an owner to each deadline, “assigned to me” filter |
| **Freemium** | 10 documents a month on Free; Premium unlocks unlimited documents and AI-written drafts (simulated upgrade, no payments) |

## AI engines

- **Claude** (when `ANTHROPIC_API_KEY` is set): reads photos and PDFs directly, returns schema-validated JSON (`server/src/ai/schema.ts`), and writes tailored drafts. Uses `claude-opus-5-5` with server-side refusal fallback enabled (`fallbacks: "default"`). Document text is treated as data, so instructions inside a letter are ignored.
- **Offline rule-based reader** (`server/src/ai/heuristic.ts`): used when no key is set, in tests, and as an automatic fallback if an API call fails. It handles text and PDFs but not photos.

## Run it

Requires Node 22+.

```bash
npm install
npm run dev          # API on :3001, web app on http://localhost:5173
```

Production-style:

```bash
npm run build
npm start            # serves API + web app on http://localhost:3001
```

Copy `.env.example` to `.env` (or export the variables) to enable Claude, set the inbox domain and the inbound-email secret. To try it without real post, use **Add → Try a sample**.

```bash
npm test             # API and extraction tests (vitest)
npm run typecheck
```

## Layout

```
server/            Node + Express + TypeScript API
  src/ai/          Claude engine, offline reader, draft templates, output schema
  src/app.ts       HTTP routes
  src/service.ts   capture pipeline, quotas, households
  src/reminders.ts reminder schedule + iCalendar export
  src/email.ts     inbound email parsing
  test/            vitest + supertest, with sample IE/UK documents
web/               React + Vite mobile-first PWA
```

## Before launch

The prototype keeps the product shape and leaves out the infrastructure:

- **Auth**: bearer tokens issued at sign-up. Replace with a real identity provider (passwordless email or Sign in with Apple/Google).
- **Storage**: a JSON file (`data/db.json`). Move to Postgres or Cosmos DB in an EU region with encryption at rest, and keep original files in blob storage.
- **OCR**: Claude reads images directly. Azure Document Intelligence can be added in front of it for EU-resident OCR.
- **Reminders**: the hourly loop logs reminders. Connect push notifications and email.
- **Payments**: the Premium toggle is simulated.
- **Mobile**: the web app is a PWA. Wrap it with React Native or Expo once the flows are validated.
