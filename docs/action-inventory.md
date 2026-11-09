# Action inventory

Every button and control in the app, with what it should do. `npm run e2e` checks each one in both builds:
- **Full app:** web app plus API.
- **Phone demo:** the single-page artifact, with a strict mock of the claude.ai runtime.

After every action the suite also checks: no page errors, no unhandled promise rejections, no sideways scrolling at 390px. Data-changing actions are also checked after a page reload.

| Screen | Action | Expected result | Builds |
|---|---|---|---|
| Welcome | Start with a name | Timeline with 3 labelled example letters | both |
| Welcome | Join with an invite code | Second person sees the same household timeline | full |
| Home | "What is Life Admin?" card on first visit → Got it | Hidden, and stays hidden after reload | both |
| Home | "What is Life Admin?" link / top-bar info button | Explainer opens in a sheet; "Add a letter" goes to Add | both |
| Timeline | Next-up main button | Opens the right draft (reply / cancel / better price) or marks a payment paid | both |
| Timeline | Next-up "Mark done" | Moves to the next item; Undo toast; saved after reload | both |
| Timeline | Tick a row, then Undo | Restored, and still restored after reload | both |
| Timeline | Mark a payment paid | "€… due" headline and progress bar update straight away | both |
| Timeline | "Dates to check" → Looks right | Count drops by one; saved after reload | both |
| Timeline | "Dates to check" → Fix it | Opens the letter | both |
| Timeline | Hide first-week checklist | Stays hidden after reload | both |
| Timeline | Done (n) | Shows and hides finished items | both |
| Timeline | Everyone / Assigned to me | Filters by owner | full |
| Timeline | Finish everything | "You're all caught up" with the correct handled count | both |
| Add | Try an example | Reading steps → "Found …" → document | both |
| Add | Paste text → Read this | Document; listed in Library after reload | both |
| Add | Upload a text file | Document | both |
| Add | Upload a PDF | Document read from the PDF | full |
| Add | Take a photo (several pages), remove a page, Read this letter | Read by Claude with the remaining pages | demo |
| Add | Free plan limit reached | Clear "free plan" message | full |
| Document | Tap a fact → change amount (1.250,00) → Save changes | €1,250.00, marked Confirmed, saved after reload | both |
| Document | Invalid amount | "Enter the amount as a number" message | both |
| Document | Fact sheet → Mark as done | Saved | both |
| Document | Owner picker | Assigns a household member | full |
| Document | Confirm all | "All confirmed", saved after reload | both |
| Document | Cancel it / Ask for a better price / Reply / Complain | Draft sheet with subject and body | both |
| Document | Copy email | "Copied" (falls back to selecting the text) | both |
| Document | Rewrite with this | Draft includes the note | both |
| Document | Premium AI draft | Written by Claude, labelled as AI | demo |
| Document | Details / Original text | Reference numbers; quotes highlighted | both |
| Document | Delete → Undo | Document kept | both |
| Document | Delete → wait | Gone, also after reload | both |
| Document | Back | Returns to where you came from (Timeline, Library, Add) | both |
| Library | Search | Filters; "Nothing matches" when empty | both |
| Household | Rename household | Saved after reload | both |
| Household | Try Premium / Switch to Free | Plan badge changes | both |
| Household | Reminder email | Saved; invalid email explained | full |
| Household | Calendar link | Returns an .ics calendar | full |
| Household | Sign out | Back to Welcome | full |
| Failure | Network down during an action | Error toast with Retry; change rolled back; Retry works | full |
| Failure | Temporary save failure | Error toast with Retry; Retry works | demo |
| Failure | No permission to save to the account | One notice; changes kept in this browser across reloads | demo |
| Failure | Claude not allowed | Text still read by the offline reader; photo option explains why | demo |
| All screens | Accessibility (light and dark) | No WCAG 2.1 A/AA violations (axe) | both |
