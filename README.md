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

## Design

The interface follows the UI/UX revamp plan in [`docs/ux-revamp-plan.md`](docs/ux-revamp-plan.md), which draws on ten designers' ideas:
- **Calm by design:** one daily reminder digest, quiet hours, and no streaks or guilt.
- **Trust in AI:** every date and amount shows the exact line it was read from, with a one-tap confirm.
- **Forgiveness:** undo instead of confirmation dialogs.
- **Mobile first:** thumb-reachable actions and bottom sheets.

Design tokens live in `web/src/design/tokens.css`, components in `web/src/ui/`, and illustrations in `web/src/illustrations/`. The fonts (Bricolage Grotesque and Atkinson Hyperlegible Next) are self-hosted, with no third-party requests. [`docs/usability-test-script.md`](docs/usability-test-script.md) is the before/after usability test.

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
npm run e2e          # builds both apps, then clicks every action in docs/action-inventory.md
```

The end-to-end suite (`web/e2e/`) drives every button in both builds:
- **Full app:** the web app plus the API.
- **Phone demo:** run against a strict mock of the claude.ai runtime. Data read from it is frozen, overlapping writes are rejected, and failures can be switched on.

It checks that each change survives a reload, that failures show a clear message with Retry, and that every screen passes an axe accessibility scan in light and dark.

## Free time

The **Free time** tab plans your free hours in Ireland. You choose a day, a time window, a town, who's going, a budget per person and your interests. It builds up to three timed plans, allowing for travel time, typical opening hours, sunset, the forecast and your budget. Evenings are planned around a timed event (a gig, a show) when there's one that fits. With kids, plans never include pubs or clubs. Every stop comes from the data below; nothing is invented. Saved plans also appear in the household's calendar feed.

**Swipe through what's on:** a Tinder-style deck of everything on near you that day. Drag a card right (or tap ♥, or press →) to like it, and left (✕ / ←) to pass. Each person's likes and passes are remembered by type of outing (gigs, walks, pubs…). That taste shapes what's shown first and how plans are scored. Things you passed on are never suggested again, and "Plan with my picks" builds the day around what you liked. "Your taste" shows what you like and what you're less keen on, with a reset.

| Source | Used for | Licence |
|---|---|---|
| [Fáilte Ireland – Tourism Activities and Attractions](https://data.gov.ie/dataset/tourism-activities-and-attractions) | Heritage, museums, beaches, walks, food, pubs, activities | CC BY 4.0 |
| [Fáilte Ireland – Events](https://data.gov.ie/dataset/events) | Gigs, shows, comedy, family events, festivals, markets (updated daily) | CC BY 4.0 |
| [Get Ireland Active – Sport Ireland trailheads](https://data.gov.ie/dataset/getirelandactive_trailheads) | 1,600+ registered walking, cycling and paddling trails | CC BY 4.0 |
| Met Éireann forecast API | Rain and temperature for the chosen time, so plans lean indoors when it's wet | CC BY 4.0 |
| Ticketmaster Discovery API | Extra gigs, club nights and sport. **Off unless `TICKETMASTER_API_KEY` is set.** | Ticketmaster API terms |

entertainment.ie has no public feed or data licence that we could find, so it isn't used. It can be added as a source if they agree to supply a feed.

How the data is kept up to date:
- `npm run freetime:snapshot -w server` fetches every source into `server/data/freetime-snapshot.json`.
- The snapshot is committed, so the app and the phone demo work offline.
- The server loads the snapshot at start-up, then refreshes from the live sources once a day. Set `FREETIME_LIVE=0` to turn the refresh off.
- If a source fails, the other sources and the previous data stay in use.

## Phone demo

`npm run build:demo -w web` builds a version that runs entirely in the browser, packed into one page (`web/dist-demo/life-admin.html`) for publishing as a claude.ai artifact. It reuses the same screens and the offline reader, and swaps the server for `web/src/demo/`. Documents are read by Claude through the artifact runtime when available, including photos. Each person's data is saved privately to their claude.ai account, or in their browser if that isn't possible. Free time runs in the browser on the same planner, using the dated snapshot published next to the page as `freetime.json`. The demo can't fetch a live forecast. Email forwarding, PDFs, household sharing and the calendar feed need the full app.

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

## Deploy to Vercel

The repo is ready for Vercel:
- the web app is served as static files;
- the API runs as one serverless function (`api/index.mjs`) in Dublin (`dub1`);
- data lives in Postgres;
- two daily cron jobs replace the local server's timers.

Everything is configured in `vercel.json`.

1. **Import the repo.** On [vercel.com/new](https://vercel.com/new), import `freemana007/LifeAdmin`. Leave the root directory as the repository root and the framework preset as "Other"; `vercel.json` sets the build. Choose which branch to deploy from (merge this branch into `main`, or select it).
2. **Add a database.** In the project, open **Storage → Create Database → Neon (Postgres)**, pick the Europe (Frankfurt or London) region, and connect it to the project. That sets `DATABASE_URL` for you. The tables are created on first use.
3. **Add the settings** under **Settings → Environment Variables**:

   | Name | Value |
   |---|---|
   | `CRON_SECRET` | Any long random string. Vercel sends it to the cron jobs; anyone without it is refused. |
   | `ANTHROPIC_API_KEY` | Optional but recommended: reads photos and writes tailored drafts. Without it, the offline reader and templates are used. |
   | `INBOUND_SECRET`, `INBOX_DOMAIN` | Optional: only once an inbound email provider (Postmark, SendGrid…) posts to `/api/inbound/email`. |
   | `TICKETMASTER_API_KEY` | Optional: extra gigs in Free time. |

4. **Deploy.** When it's live, open `/api/health`; it should say `{"ok":true,…}`. Then sign up in the app.
5. **Cron jobs** run automatically:
   - `/api/cron/reminders` daily at 08:00 UTC: the one-a-day reminder digest, logged for now, as no email provider is connected yet;
   - `/api/cron/freetime` at 04:30 UTC: refreshes the Free time listings and saves them to the database.

   You'll see both under **Settings → Cron Jobs**.

Limits on Vercel:
- **Uploads:** 4 MB per file (Vercel's request limit), with a clear message for anything bigger.
- **Storage:** data is kept as one JSON document in Postgres, saved with a version check. Two changes at the very same moment get a "please try again" (the app's Retry button). That's fine for a prototype; move to proper tables before real scale.

To try this setup locally, against your own Postgres:

```bash
npm run build
DATABASE_URL=postgres://user:pass@localhost:5432/lifeadmin CRON_SECRET=dev PORT=3000 node web/e2e/vercel-local.mjs
```

## Before launch

The prototype keeps the product shape and leaves out the infrastructure:

- **Auth**: bearer tokens issued at sign-up. Replace with a real identity provider (passwordless email or Sign in with Apple/Google).
- **Storage:** locally, a JSON file (`data/db.json`); on Vercel, a single JSON document in Postgres (see above). Move to proper tables in an EU region with encryption at rest, and keep original files in blob storage.
- **OCR**: Claude reads images directly. Azure Document Intelligence can be added in front of it for EU-resident OCR.
- **Reminders**: the hourly loop logs reminders. Connect push notifications and email.
- **Payments**: the Premium toggle is simulated.
- **Mobile**: the web app is a PWA. Wrap it with React Native or Expo once the flows are validated.
