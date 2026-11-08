# Life Admin: UI/UX revamp plan

## Context

Life Admin is a working prototype: a React PWA (`web/`) backed by a Node API (`server/`), plus an in-browser demo build published as a claude.ai artifact. It covers the full flow (capture → understand → timeline → act), but the interface was built for function, not experience. Specific problems seen in the current screens:

- **The timeline is noisy.** Every new item has a "Check" badge, and a yellow banner is always present. Three equal stat tiles compete with the list, and nothing says "do this next".
- **The document page is long.** Every deadline opens as a full form. "Looks right" and "Everything looks right" duplicate each other. The Act section sits near the bottom.
- **The AI reads as a black box.** Confidence shows as a word, but the app never shows *where* in the letter a date or amount came from. That matters for trust when people act on money and deadlines.
- **There's no undo.** Delete needs a confirmation step, and mark-done can't be undone from a toast.
- **Onboarding asks before it gives.** A form comes first; value comes second.
- **The look is generic.** There's no type identity, no illustration, and no motion except a spinner. The tick target is 28px, below thumb size.

**Goal:** a calm, trustworthy, mobile-first experience that hits the plan's metrics: 3+ documents in week one, 40% active at day 30, deadlines caught, and money saved. The plan draws on the ten designers' ideas.

## Design principles (one per designer)

| Designer | Idea we take | Where it lands |
|---|---|---|
| **Don Norman** | Signifiers, immediate feedback, forgiving errors (undo over confirm), a clear conceptual model, emotional design (reflective level) | Undo toasts everywhere; a timeline model of "things to do, by when"; a caught-up reward |
| **Julie Zhuo** | Start from "what does great look like" for one user story; one clear purpose per screen; design the first-week path | Experience vision and first-week checklist; one primary action per screen |
| **Steve Schoger** (*Refactoring UI*) | Hierarchy through weight and colour, not size; de-emphasise to emphasise; constrained spacing, type and colour scales; fewer borders; designed empty states | New design tokens; Timeline and Document hierarchy; badge diet |
| **Ioana Teleanu** | AI UX: transparency, show the evidence, confidence people can understand, people stay in control, honest AI labelling | "Here's what we found" review with source snippets; one-tap confirm; AI vs basic-reader disclosure |
| **Tobias van Schneider** | A strong product "vibe" and personality; bold, dark, moody craft; typography as identity | Wordmark, display typeface, a dark theme designed as a first-class look rather than an inversion, details (tabular money, the date "stamp") |
| **Pablo Stanley** | Illustration that tells a story, humour where it's safe, accessibility for everyone, a component system people enjoy using | Illustration set for empty, onboarding and caught-up states; `ui/` component kit; co-owns the Phase 4 accessibility work |
| **Elizabeth Alli** | Mindful product design: protect people's mental health, build products that are good for people rather than addictive, design responsibly | "Calm by design" rules (below): no streaks or guilt, a notification budget, clear endings, reassuring copy for stressful letters |
| **Luke Wroblewski** | Mobile first, thumb zones, gradual engagement (value before sign-up), form design (right input types, minimal fields, inline validation) | Try before sign-up; bottom sheets for edits; native date and decimal inputs; 44–48px targets |
| **Gleb Kuznetsov** | Motion and sensory feedback that explain state changes | Three motion moments: capture → card, tick-off, all caught up; reduced-motion fallbacks |
| **Jared Spool** | Research-led design, an experience vision, outcomes over outputs, avoid "experience rot" (feature creep) | Usability rounds before and after; metric instrumentation; cut features that don't serve the vision |

**Experience vision** (Spool and Zhuo): *"Open the app, know in five seconds what needs doing this week, and deal with it in one tap. Then close it and get on with your life."*

**Calm by design** (Alli, with Norman's emotional design). These rules apply across every phase:
- **Success means fewer visits.** The goal is to close the app sooner, not open it more. Success is "all caught up", not time spent in the app.
- **No streaks, badges for usage, or guilt copy.** The first-week checklist is about the person's documents, never about app habits.
- **A notification budget.** Reminders are batched into at most one digest a day, with quiet hours (default 21:00–08:00). Urgent same-day items are the only exception. Applies to `server/src/reminders.ts` `dueReminders()` and the hourly loop in `server/src/index.ts`.
- **Overdue items are shown calmly.** Use a neutral "Past due: here's what to do now" with a next step, not a wall of red. Red is reserved for one indicator.
- **Stressful letters (Revenue, complaints) get reassuring framing.** "This is routine. Here's what it asks for." This framing goes in the analysis prompts in `server/src/ai/claude.ts` and `web/src/demo/localApi.ts`, and in the offline reader's summary text in `heuristic.ts`.
- **Clear endings.** After an action, show a short done state with nothing more to do, instead of pulling people deeper into the app.

## Phase 0: Research baseline (Spool, Zhuo)

- **Test the current version.** Run a 5-person usability test on the published demo (https://claude.ai/artifact/Qp4BNUtdfpSNA3d9FsFbUh) with four tasks: add a letter, find what's due next, fix a wrong date, cancel a renewal. Record task success, time and confusion points. Also ask how people feel after using it (calm vs anxious), which is Alli's measure.
- **Tie it to business value (Spool).** Link each change to a plan metric: activation, day-30 retention, deadlines caught, money saved, free-to-premium conversion. Report the before and after numbers.
- **Write the "what great looks like" story** for the primary user (a busy couple in Ireland) and the first-week path.
- **Instrument the metrics.** Add a small `web/src/analytics.ts`, a no-op by default with an optional server endpoint. Events: `doc_captured`, `fact_confirmed`, `fact_corrected`, `draft_copied`, `deadline_done`. Together these measure activation and AI accuracy (the correction rate).

## Phase 1: Design system foundation (Schoger, Stanley, van Schneider)

Visual scope: **evolve the current identity** (deep green, calm tone) rather than replace it. The product name is still undecided, and a full rebrand belongs after naming. The tokens make a later rebrand a one-file change.

- **`web/src/design/tokens.css`** replaces the ad-hoc `:root` in `web/src/styles.css`:
  - spacing scale (4, 8, 12, 16, 24, 32, 48);
  - type scale (12, 14, 16, 20, 24, 32);
  - colour ramps (50–900) for brand, neutral (green-tinted) and semantic (pay, renew, official, warn, alert, ok);
  - 3 elevation shadows instead of borders, and radii.
  - It keeps the existing light/dark token pattern: bare `:root`, `prefers-color-scheme` guarded by `:not([data-theme=light])`, and `[data-theme=dark]`.
- **Typography:** a characterful display face for headings and amounts (from Google Fonts, so the artifact allows it), a highly legible body face, and tabular numerals for money.
- **Component kit, `web/src/ui/`:** `Button`, `Card`, `Badge`, `ConfidenceChip`, `Sheet` (bottom sheet), `Toast` (with undo), `EmptyState` (with illustration slot), `MoneyAmount`, `DateStamp`, `ListRow`. Screens are rebuilt on these, so `styles.css` shrinks to layout only.
- **Illustrations, `web/src/illustrations/`:** 4–5 inline SVGs in one consistent line style: empty timeline, all caught up, first-run welcome, reading-your-letter. Tone rule: no playfulness on overdue items or tax letters.
- **Brand:** wordmark and app icon refresh. The name is still pending (product plan step 1), so tokens keep the brand swappable.

## Phase 2: Core flows

**2a. Onboarding (Wroblewski, Zhuo).** Files: `web/src/screens/Welcome.tsx`, `web/src/App.tsx`.
- Open straight onto the timeline with example letters (already done in the demo via `seedExamples()` in `web/src/demo/localApi.ts`; extend the same approach to the full app).
- Ask for a name only when saving matters.
- Add a first-week checklist card: "Add 3 documents", "Confirm a date", "Forward an email". It disappears once complete.

**2b. Capture (Wroblewski, Kuznetsov, Norman).** File: `web/src/screens/Capture.tsx`.
- Camera-first full-screen sheet, with primary buttons in the bottom thumb zone.
- Multi-page photos.
- Paste stays one tap away.
- Replace the spinner with staged feedback ("Reading… found a date… found €184.62"), then a motion transition of the document turning into its result card.

**2c. Review: the AI trust moment (Teleanu, Norman).** Files: `web/src/screens/DocumentDetail.tsx`, `server/src/types.ts`, `server/src/ai/heuristic.ts`, `server/src/ai/schema.ts`, `server/src/ai/claude.ts`, `web/src/demo/localApi.ts`.
- **Show where each fact came from.** Add an `evidence` string (the source snippet) to each extracted deadline and to `amountDue`:
  - the offline reader already has the match position (`findDates()` returns `index` and `raw`; `findAmounts()` returns `index`), so it reuses `lineAround()`;
  - Claude's schema gets an `evidence` field.
- **New top-of-page "Here's what we found" card.** Each fact is one row (date stamp, amount, confidence in plain words), with "from your letter: '…debited on or after 18/11/2026'".
  - One **Confirm all** button.
  - Tap a row to edit it in a bottom `Sheet` with a native date input and a decimal keypad.
  - This removes the always-open per-deadline forms.
- **Summary and actions** sit directly under the card, with **Act** buttons promoted beside them.
- **Original text** is a collapsible section with the evidence highlighted.

**2d. Timeline (Schoger, Norman).** File: `web/src/screens/Timeline.tsx`.
- **Hero "Next up" card:** the single most urgent open item, with its verb button (Pay / Decide / Reply / Cancel).
- **One quiet "3 things to check" row** opens a review queue. It replaces the per-item badges and the permanent banner.
- **Grouped list**, with type shown by icon plus label (not colour alone), and tick targets of 48px.
- **Mark done** shows an undo toast.
- **Stats:** a single line, "€926 due in the next 30 days", instead of three tiles.
- **All caught up:** an illustration plus reflective stats: deadlines caught, price rises flagged.

**2e. Act (Norman, Teleanu).** Draft UI moves into a `Sheet` launched from the timeline and from the review card.
- An "AI draft, read before sending" label, and Copy as the primary action (this pattern already exists in `DraftView`).

**2f. Forgiveness (Norman).**
- Replace delete confirmations with delete plus an undo toast. Deletion is held for 5 seconds before it's committed.
- Rewrite errors in the "what happened + how to fix" form. Existing copy lives in `server/src/app.ts` and `localApi.ts`.

**2g. Prune (Spool).** Keep the four tabs. Fold the Documents filters into search, and drop UI that the Phase 0 tests show nobody uses.

## Phase 3: Personality and motion (van Schneider, Stanley, Kuznetsov)

- **Motion spec:** 150–300ms ease-out, only on three moments (capture → card, tick-off, caught up), with `prefers-reduced-motion` fallbacks to instant state changes.
- **Voice guide:** calm, plain Irish/UK English, short sentences. Light humour only in empty and caught-up states.
- **Detail pass:** the date-stamp component, money in tabular figures, a consistent icon set (stroked SVG, which replaces the remaining ad-hoc icons in `App.tsx` and `Capture.tsx`).

## Phase 4: Accessibility and validation

- WCAG 2.1 AA:
  - contrast checked on both themes;
  - 44px minimum targets;
  - labelled controls (stable `id`s already exist);
  - focus order and visible focus;
  - screen-reader labels for confidence and deadline type;
  - text scaling up to 200%.
- Run a second 5-person usability round with the same four tasks, and compare against Phase 0, including the calm/anxious rating.

## Deliberately out of scope (Spool: avoid experience rot)

Gleb Kuznetsov's voice, 3D and futuristic interfaces are not part of this revamp. Motion is used only where it explains a state change. A voice capture idea ("What do I owe this month?") is noted for after the core flows test well.

## Critical files

- `web/src/styles.css` → split into `web/src/design/tokens.css` plus layout.
- New: `web/src/ui/*`, `web/src/illustrations/*`, `web/src/analytics.ts`.
- `web/src/screens/{Timeline,DocumentDetail,Capture,Welcome,Documents,Household}.tsx`.
- `server/src/types.ts`, `server/src/ai/{heuristic,schema,claude}.ts` (evidence snippets).
- `web/src/demo/localApi.ts` (evidence from Claude JSON, plus seeding in the full app).
- Reuse as-is: `web/src/format.ts` (`relative`, `money`, `KIND_LABEL`), `findDates`/`findAmounts`/`lineAround` in `heuristic.ts`, and the backend abstraction in `web/src/demo/storage.ts`.

## Verification

- `npm test`, with new heuristic tests asserting the `evidence` snippets, and `npm run typecheck`.
- `npm run build` and `npm run build:demo -w web`.
- Playwright scripts at 390px, light and dark:
  - existing flows (sign-up, add a sample, draft, delete with undo, mark done with undo);
  - no horizontal scroll;
  - no console errors;
  - screenshots of each screen reviewed against the principles table.
- An accessibility scan with `@axe-core/playwright` (dev dependency) on each screen.
- Republish the demo artifact (same file path) and repeat the four usability tasks.
