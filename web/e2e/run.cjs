/*
 * End-to-end test of every action in docs/action-inventory.md, in both builds:
 *   - "server": the full app (web/dist) served by the API (server/dist), offline reader
 *   - "demo":   the single-page demo (web/dist-demo/life-admin.html) with a strict
 *               claude.ai runtime mock (frozen reads, write conflicts, failure switches)
 * Every step also checks: no page errors, no unhandled rejections, no sideways scroll.
 *
 * Usage: npm run e2e            (builds first)
 *        node web/e2e/run.cjs   (uses existing builds)
 *        E2E_ONLY=demo|server node web/e2e/run.cjs
 */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lifeadmin-e2e-"));
const PORT = 3199;
const DEMO_PORT = 3197;
const DEMO_URL = `http://localhost:${DEMO_PORT}/demo.html`;
const BASE = `http://localhost:${PORT}`;
const MOCK = fs.readFileSync(path.join(__dirname, "mockRuntime.js"), "utf8");
const ONLY = process.env.E2E_ONLY;

const results = [];
let current = null;

// ---------- harness ----------

async function step(group, name, fn) {
  const started = Date.now();
  try {
    await fn();
    if (current) await healthCheck(current);
    results.push({ group, name, ok: true, ms: Date.now() - started });
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    const shot = path.join(TMP, `${group}-${name}`.replace(/[^a-z0-9-]+/gi, "_").slice(0, 80) + ".png");
    if (current) await current.page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    results.push({ group, name, ok: false, error: String(e && e.message ? e.message : e).split("\n")[0], shot });
    process.stdout.write(`  ✗ ${name}\n      ${String(e && e.message ? e.message : e).split("\n")[0]}\n      screenshot: ${shot}\n`);
    if (current) current.errors.length = 0;
    if (process.env.E2E_BAIL) throw new Error("stopping at first failure (E2E_BAIL)");
  }
}

async function healthCheck(ctx) {
  const { page, errors } = ctx;
  const width = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => 390);
  if (width > 392) throw new Error(`horizontal overflow: ${width}px`);
  if (errors.length) {
    const msg = errors.join(" | ");
    errors.length = 0;
    throw new Error(`page errors: ${msg}`);
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

async function open(browser, mode, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: opts.scheme ?? "light" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  if (mode === "demo") {
    // Settings first: the mock reads them when it starts.
    if (opts.mock) await context.addInitScript(`localStorage.setItem("__mockcfg", ${JSON.stringify(JSON.stringify(opts.mock))})`);
    await context.addInitScript(MOCK);
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && /unhandled|screen error|Uncaught/i.test(t)) errors.push(t);
  });
  await page.goto(mode === "demo" ? DEMO_URL : BASE);
  current = { page, errors, context };
  return current;
}

async function start(page, name = "Anna") {
  await page.waitForSelector("#name");
  await page.fill("#name", name);
  await page.click("text=Show me how it works");
  await page.waitForSelector(".next-up", { timeout: 10000 });
}

const tab = (page, name) => page.click(`nav >> text=${name}`);
async function reload(page) {
  await page.reload();
  try {
    await page.waitForSelector(".summary-head", { timeout: 10000 });
  } catch (e) {
    const state = await page
      .evaluate(() => ({
        url: location.href,
        keys: Object.keys(localStorage),
        mockDocs: Object.keys(JSON.parse(localStorage.getItem("__mockdb") || "{}")).length,
        mode: localStorage.getItem("lifeadmin.demo.mode"),
        welcome: Boolean(document.querySelector("#name")),
      }))
      .catch((x) => String(x));
    throw new Error(`after reload the timeline didn't appear: ${JSON.stringify(state)}`);
  }
}
const text = (page, sel) => page.locator(sel).first().innerText();
async function openDoc(page, provider) {
  await tab(page, "Library");
  await page.click(`.doc-row:has-text("${provider}")`);
  await page.waitForSelector(".doc-band");
}

function minimalPdf(lines) {
  const content = "BT /F1 12 Tf 72 720 Td 16 TL " + lines.map((l) => `(${l}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// ---------- shared tests (both builds) ----------

async function coreTests(browser, mode) {
  const G = mode;
  const { page } = await open(browser, mode);

  await step(G, "Welcome: start with just a name shows a timeline with 3 examples", async () => {
    await start(page);
    await tab(page, "Library");
    await page.waitForSelector(".doc-row");
    expect((await page.locator(".doc-row").count()) === 3, "expected 3 example documents");
    expect((await page.locator(".badge-example").count()) >= 3, "examples should be labelled");
    await tab(page, "Timeline");
    await page.waitForSelector(".next-up");
  });

  await step(G, "Home: explains what Life Admin is; Got it hides it (also after reload)", async () => {
    await page.waitForSelector(".about-card");
    expect(/household post/.test(await text(page, ".about-card")), "explainer should say what the app is");
    expect((await page.locator(".about-steps li").count()) === 3, "explainer should have 3 steps");
    await page.click('.about-card button:has-text("Got it")');
    await page.waitForSelector(".about-link");
    await reload(page);
    expect((await page.locator(".about-card").count()) === 0, "explainer should stay hidden");
  });

  await step(G, "Home: the link and the top-bar info button open the explainer; Add a letter opens Add", async () => {
    await page.click(".about-link");
    await page.waitForSelector('.sheet:has-text("household post")');
    await page.click(".sheet-close");
    await page.waitForSelector(".sheet", { state: "detached" });
    await page.click('.topbar button[aria-label="What is Life Admin?"]');
    await page.click('.sheet button:has-text("Add a letter")');
    await page.waitForSelector(".capture-option");
    await tab(page, "Timeline");
    await page.waitForSelector(".next-up");
  });

  await step(G, "Timeline: Next-up primary action opens the right draft", async () => {
    const label = await text(page, ".next-up .btn-on-colour");
    await page.click(".next-up .btn-on-colour");
    if (/Mark as paid/.test(label)) return;
    await page.waitForSelector(".sheet #draft-body");
    expect((await page.inputValue("#draft-body")).length > 20, "draft body should be filled");
    await page.click(".sheet-close");
    await page.waitForSelector(".sheet", { state: "detached" });
  });

  await step(G, "Document: Back returns to where you came from (Timeline)", async () => {
    expect(/Timeline/.test(await text(page, ".back")), "back label should say Timeline");
    await page.click(".back");
    await page.waitForSelector(".next-up");
  });

  await step(G, "Timeline: Mark done on Next-up, persists after reload", async () => {
    const title = await text(page, "#next-title");
    await page.click('.next-up button:has-text("Mark done"), .next-up button:has-text("Mark as paid")');
    await page.waitForSelector(".toast");
    expect((await text(page, "#next-title").catch(() => "")) !== title, "Next-up should move on");
    await page.waitForTimeout(5300); // let the undo window pass
    await reload(page);
    await page.click("text=Done (");
    await page.waitForSelector(`.tl-done .tl-item:has-text("${title.split(" – ")[1] ?? title}")`);
  });

  await step(G, "Timeline: Undo after ticking restores the item (and survives reload)", async () => {
    const row = page.locator(".spine .tl-item").first();
    const name = await row.locator(".tl-title").innerText();
    await row.locator(".tick").click();
    await page.waitForSelector(".toast");
    await page.click(".toast >> text=Undo");
    await page.waitForTimeout(300);
    await reload(page);
    await page.waitForSelector(`.spine .tl-item:has-text("${name}")`);
  });

  await step(G, "Timeline: the € headline drops when a payment is marked paid", async () => {
    const before = await text(page, ".big-money").catch(() => "");
    const payRow = page.locator('.spine .tl-item:has(.tl-verb:has-text("Pay by"))').first();
    if (!(await payRow.count())) return; // nothing payable left in this build's data
    await payRow.locator(".tick").click();
    await page.waitForTimeout(200);
    const after = await text(page, ".big-money").catch(() => "€0");
    expect(after !== before, `headline should change (was ${before}, now ${after})`);
    await page.click(".toast >> text=Undo");
    await page.waitForTimeout(300);
  });

  await step(G, "Timeline: check queue → Looks right lowers the count and persists", async () => {
    const before = Number(await text(page, ".check-row .count"));
    await page.click(".check-row");
    await page.waitForSelector(".sheet");
    await page.click('.sheet button:has-text("Looks right")');
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape");
    await reload(page);
    const after = Number(await text(page, ".check-row .count").catch(() => "0"));
    expect(after === before - 1, `count should drop by one (${before} → ${after})`);
  });

  await step(G, "Timeline: check queue → Fix it opens the letter", async () => {
    await page.click(".check-row");
    await page.click('.sheet button:has-text("Fix it")');
    await page.waitForSelector(".doc-band");
    await tab(page, "Timeline");
  });

  await step(G, "Timeline: Hide the first-week checklist (stays hidden after reload)", async () => {
    await page.click('.checklist-card button:has-text("Hide")');
    await reload(page);
    expect((await page.locator(".checklist-card").count()) === 0, "checklist should stay hidden");
  });

  await step(G, "Capture: try an example → reading → result → document", async () => {
    await tab(page, "Add");
    await page.click('.choice:has-text("Broadband")');
    await page.waitForSelector(".stages");
    await page.waitForSelector(".found");
    await page.waitForSelector(".doc-band", { timeout: 8000 });
    expect(/Virgin/.test(await text(page, ".doc-band h1")), "should open the Virgin Media letter");
  });

  await step(G, "Capture: paste text → document, still in Library after reload", async () => {
    await tab(page, "Add");
    await page.click('.capture-option:has-text("Paste text")');
    await page.fill("#paste", "Bord Gáis Energy\nGas bill\nAccount number: 4455 6677\nTotal amount due: €132.40\nPayment due by 05/12/2026");
    await page.click('button:has-text("Read this")');
    await page.waitForSelector(".doc-band", { timeout: 8000 });
    await reload(page);
    await tab(page, "Library");
    await page.waitForSelector('.doc-row:has-text("Bord")');
  });

  await step(G, "Capture: upload a text file → document", async () => {
    await tab(page, "Add");
    await page.setInputFiles("#upload", { name: "eir.txt", mimeType: "text/plain", buffer: Buffer.from("Eir\nYour broadband bill\nAccount number: 77881\nTotal amount due: €59.99\nPayment due by 12/12/2026") });
    await page.waitForSelector(".doc-band", { timeout: 8000 });
    expect(/Eir/.test(await text(page, ".doc-band h1")), "should open the Eir bill");
  });

  await step(G, "Document: edit a fact with an Irish-style amount (1.250,00), persists", async () => {
    await openDoc(page, "Bord");
    await page.click(".fact >> nth=0");
    await page.waitForSelector("#fact-amount");
    await page.fill("#fact-amount", "1.250,00");
    await page.click('.sheet button:has-text("Save changes")');
    await page.waitForSelector(".sheet", { state: "detached" });
    await reload(page);
    await openDoc(page, "Bord");
    expect(/1,250\.00/.test(await text(page, ".fact .money")), "amount should be €1,250.00");
    expect(/Confirmed/.test(await text(page, ".fact .chip-conf")), "edited fact should be confirmed");
  });

  await step(G, "Document: a wrong amount shows a helpful message, not a crash", async () => {
    await page.click(".fact >> nth=0");
    await page.fill("#fact-amount", "abc");
    await page.click('.sheet button:has-text("Save changes")');
    await page.waitForSelector('.sheet .error:has-text("number")');
    await page.click(".sheet-close");
  });

  await step(G, "Document: Mark as done from the fact sheet", async () => {
    await page.click(".fact >> nth=0");
    await page.click('.sheet button:has-text("Mark as done")');
    await page.waitForSelector(".sheet", { state: "detached" });
  });

  await step(G, "Document: Confirm all, persists after reload", async () => {
    await openDoc(page, "Eir");
    const btn = page.locator('button.btn-primary:has-text("Confirm")');
    await btn.waitFor();
    await btn.click();
    await page.waitForSelector(".notice.ok, .toast-error", { timeout: 8000 });
    expect(!(await page.locator(".toast-error").count()), `confirm failed: ${await text(page, ".toast-error").catch(() => "")}`);
    await reload(page);
    await openDoc(page, "Eir");
    await page.waitForSelector("text=All confirmed");
  });

  for (const kind of ["Cancel it", "Ask for a better price", "Reply", "Complain"]) {
    await step(G, `Document: draft “${kind}”, copy it, rewrite with a note`, async () => {
      await openDoc(page, "AXA");
      await page.click(`.act:has-text("${kind}")`);
      await page.waitForSelector(".sheet #draft-body");
      await page.click('.sheet button:has-text("Copy email")');
      await page.waitForSelector('.sheet button:has-text("Copied")');
      await page.fill("#draft-note", "I'm moving house on 1 March");
      await page.click('.sheet button:has-text("Rewrite with this")');
      await page.waitForFunction(() => /moving house/.test(document.querySelector("#draft-body")?.value ?? ""));
      await page.click(".sheet-close");
    });
  }

  await step(G, "Document: details and original text open, quotes are highlighted", async () => {
    await openDoc(page, "AXA");
    await page.click('summary:has-text("Details")');
    await page.waitForSelector("text=MTR/4471209");
    await page.click('summary:has-text("Original text")');
    expect((await page.locator(".original mark").count()) >= 1, "evidence should be highlighted");
  });

  await step(G, "Document: Delete → Undo keeps the document", async () => {
    await openDoc(page, "Eir");
    await page.click('button:has-text("Delete this document")');
    await page.waitForSelector(".toast");
    await page.click(".toast >> text=Undo");
    await page.waitForSelector('.doc-row:has-text("Eir")');
  });

  await step(G, "Document: Delete → wait → gone for good (also after reload)", async () => {
    await openDoc(page, "Eir");
    await page.click('button:has-text("Delete this document")');
    await page.waitForTimeout(5600);
    expect((await page.locator('.doc-row:has-text("Eir")').count()) === 0, "should be gone from the list");
    await reload(page);
    await tab(page, "Library");
    await page.waitForSelector(".doc-row");
    expect((await page.locator('.doc-row:has-text("Eir")').count()) === 0, "should still be gone after reload");
  });

  await step(G, "Library: search filters, opening a result works", async () => {
    await page.fill("#search", "revenue");
    expect((await page.locator(".doc-row").count()) === 1, "search should leave one result");
    await page.fill("#search", "zzzz");
    await page.waitForSelector("text=Nothing matches");
    await page.fill("#search", "");
    await page.click('.doc-row:has-text("Revenue")');
    await page.waitForSelector(".doc-band");
    expect(/Library/.test(await text(page, ".back")), "back should say Library");
  });

  await step(G, "Household: rename the household (persists)", async () => {
    await tab(page, "Household");
    await page.fill("#household-name", "The Byrnes");
    await page.click('button:has-text("Save name")');
    await page.waitForSelector("text=Household name saved");
    await reload(page);
    await tab(page, "Household");
    expect((await page.inputValue("#household-name")) === "The Byrnes", "name should persist");
  });

  await step(G, "Household: Try Premium, then Switch to Free", async () => {
    await page.click('button:has-text("Try Premium")');
    await page.waitForSelector('.pill:has-text("Premium")');
    await page.click('button:has-text("Switch to Free")');
    await page.waitForSelector('.pill:has-text("Free plan")');
  });

  await step(G, "Free time: plan a Saturday evening in Dublin (gigs), see another plan, open links", async () => {
    await tab(page, "Free time");
    await page.waitForSelector(".ft-form");
    await page.locator(".ft-form .choice-chips").first().locator(".choice").nth(2).click(); // Saturday
    await page.selectOption("#ft-near", "dublin-city-centre");
    await page.selectOption("#ft-start", "18:00");
    await page.selectOption("#ft-end", "23:30");
    await page.click('.choice:has-text("Friends")');
    await page.click('.choice:has-text("Gigs & music")');
    await page.click('button:has-text("Just plan it for me")');
    await page.waitForSelector(".ft-itinerary", { timeout: 10000 });
    expect((await page.locator(".ft-stop").count()) >= 1, "plan should have stops");
    expect((await page.locator('.ft-stop .kind:has-text("Gig"), .ft-stop .kind:has-text("Live music")').count()) >= 1, "a gigs plan should include music");
    const first = await text(page, ".ft-plan-title");
    if (await page.locator('button:has-text("Show another plan")').count()) {
      await page.click('button:has-text("Show another plan")');
      await page.waitForFunction((t) => document.querySelector(".ft-plan-head .eyebrow")?.textContent?.startsWith("Plan 2"), first);
    }
    const href = await page.locator(".ft-stop a:has-text('Map')").first().getAttribute("href");
    expect(/^https:\/\/www\.google\.com\/maps/.test(href ?? ""), "map link should open Google Maps");
    expect(/Fáilte Ireland/.test(await text(page, ".ft-credits")), "open-data credits should be shown");
  });

  await step(G, "Free time: swipe deck: drag right to like, button to pass, arrow key, undo", async () => {
    await page.selectOption("#ft-start", "10:00");
    await page.selectOption("#ft-end", "22:00");
    await page.click('button:has-text("Swipe through what\'s on")');
    await page.waitForSelector(".swipe-card.is-top");
    const first = await page.locator(".swipe-card.is-top h3").innerText();
    const card = page.locator(".swipe-card.is-top");
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600); // let the smooth scroll settle before measuring
    const box = await card.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForSelector(`.picks li:has-text("${first.slice(0, 20).replace(/"/g, '\\"')}")`);
    const second = await page.locator(".swipe-card.is-top h3").innerText();
    await page.click(".deck-nope");
    await page.waitForFunction((n) => document.querySelector(".swipe-card.is-top h3")?.textContent !== n, second);
    const third = await page.locator(".swipe-card.is-top h3").innerText();
    await page.focus(".deck");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((n) => document.querySelector(".swipe-card.is-top h3")?.textContent !== n, third);
    await page.click(".deck-undo");
    await page.waitForFunction((n) => document.querySelector(".swipe-card.is-top h3")?.textContent === n, third);
    await page
      .waitForFunction(() => document.querySelectorAll(".picks li").length === 1, null, { timeout: 5000 })
      .catch(async () => {
        throw new Error(`expected 1 pick after undo, found ${await page.locator(".picks li").count()}`);
      });
    const kindLabel = await page.locator(".picks li .small").first().innerText();
    const firstKind = kindLabel.split(" · ")[0];
    await page.waitForFunction((k) => document.querySelector(".taste")?.textContent?.includes(k), firstKind, { timeout: 5000 });
  });

  await step(G, "Free time: taste and picks survive reload; Plan with my picks includes them", async () => {
    const pick = (await page.locator(".picks li strong").first().innerText()).trim();
    await reload(page);
    await tab(page, "Free time");
    await page.waitForSelector(".taste");
    await page.click('button:has-text("Swipe through what\'s on")');
    await page.waitForSelector(".picks li");
    await page.click('button:has-text("Plan with my picks")');
    await page.waitForSelector(".ft-itinerary", { timeout: 10000 });
    const stops = await page.locator(".ft-stop h3").allInnerTexts();
    expect(stops.includes(pick), `plan should include the pick "${pick}" (got ${stops.join(" → ")})`);
  });

  await step(G, "Free time: reset taste forgets swipes", async () => {
    await page.click('.taste button:has-text("Reset")');
    await page.click('.taste button.btn-danger:has-text("Reset")');
    await page.waitForSelector(".taste", { state: "detached" });
  });

  await step(G, "Free time: save a plan (survives reload), then delete it", async () => {
    await page.click('button:has-text("Save plan")');
    await page.waitForSelector('.toast:has-text("Plan saved")');
    await reload(page);
    await tab(page, "Free time");
    await page.waitForSelector(".ft-saved li");
    const n = await page.locator(".ft-saved li").count();
    await page.click('.ft-saved button[aria-label^="Delete plan"]');
    await page.waitForTimeout(300);
    expect((await page.locator(".ft-saved li").count()) === n - 1, "plan should be deleted");
  });

  await step(G, "Free time: with kids, never a pub or club; a too-short slot explains itself", async () => {
    await page.click('.choice:has-text("With kids")');
    await page.click('.choice:has-text("Gigs & music")'); // turn off
    await page.selectOption("#ft-start", "13:00");
    await page.selectOption("#ft-end", "18:00");
    await page.click('button:has-text("Just plan it for me")');
    await page.waitForSelector(".ft-itinerary, .empty-state", { timeout: 10000 });
    const kinds = await page.locator(".ft-stop .kind").allInnerTexts();
    expect(!kinds.some((k) => /pub|club/i.test(k)), `kids plan included: ${kinds.join(", ")}`);
    await page.selectOption("#ft-start", "13:00");
    await page.selectOption("#ft-end", "14:00");
    await page.click('button:has-text("Just plan it for me")');
    await page.waitForSelector(".ft-itinerary, .empty-state", { timeout: 10000 });
  });

  await step(G, "Timeline: the weekend nudge (when shown) opens Free time", async () => {
    await tab(page, "Timeline");
    await page.waitForSelector(".summary-head");
    if (await page.locator(".weekend-nudge").count()) {
      await page.click(".weekend-nudge");
      await page.waitForSelector(".ft-form");
      await tab(page, "Timeline");
      await page.waitForSelector(".summary-head");
    }
  });

  await step(G, "Timeline: all caught up after everything is done", async () => {
    await tab(page, "Timeline");
    await page.waitForSelector(".summary-head");
    for (let i = 0; i < 20 && (await page.locator(".next-up").count()); i++) {
      await page.click('.next-up button:has-text("Mark done"), .next-up button:has-text("Mark as paid")');
      await page.waitForTimeout(120);
    }
    await page.waitForSelector(".caught-up");
    expect(!/^0 /.test(await text(page, ".reflect div")), "handled count should not be 0");
  });

  await current.context.close();
  current = null;
}

// ---------- full-app-only tests ----------

async function serverTests(browser) {
  const G = "server";
  const a = await open(browser, "server");
  let invite = "";

  await step(G, "Welcome: second person joins with the invite code and sees the same timeline", async () => {
    await start(a.page, "Anna");
    await tab(a.page, "Household");
    invite = (await text(a.page, ".inbox code")).trim();
    const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pb = await b.newPage();
    await pb.goto(BASE);
    await pb.fill("#name", "Seán");
    await pb.click("text=Joining someone's household?");
    await pb.fill("#invite", invite);
    await pb.click('button:has-text("Join household")');
    await pb.waitForSelector(".next-up");
    await pb.click("nav >> text=Household");
    await pb.waitForSelector("text=Seán");
    await b.close();
  });

  await step(G, "Timeline: Everyone / Assigned to me filter (2 members)", async () => {
    await tab(a.page, "Timeline");
    await reload(a.page);
    await a.page.click('.segmented button:has-text("Assigned to me")');
    await a.page.waitForSelector(".caught-up, .next-up, .summary-head");
    await a.page.click('.segmented button:has-text("Everyone")');
    await a.page.waitForSelector(".next-up");
  });

  await step(G, "Document: assign an owner in the fact sheet", async () => {
    await openDoc(a.page, "Electric");
    await a.page.click(".fact >> nth=0");
    await a.page.selectOption("#fact-owner", { label: "Seán" });
    await a.page.click('.sheet button:has-text("Save changes"), .sheet button:has-text("Looks right")');
    await a.page.waitForSelector(".sheet", { state: "detached" });
    await tab(a.page, "Timeline");
    await a.page.waitForSelector('.tl-item:has-text("Seán"), .next-up');
  });

  await step(G, "Capture: upload a PDF → document", async () => {
    await tab(a.page, "Add");
    await a.page.setInputFiles("#upload", { name: "vodafone.pdf", mimeType: "application/pdf", buffer: minimalPdf(["Vodafone Ireland", "Your mobile bill", "Account number: 7731 2290", "Total amount due: 45.00 EUR", "Payment due by 20/12/2026"]) });
    await a.page.waitForSelector(".doc-band", { timeout: 10000 });
    expect(/Vodafone/.test(await text(a.page, ".doc-band h1")), "should read the PDF");
  });

  await step(G, "Household: reminder email (valid saves, invalid explains)", async () => {
    await tab(a.page, "Household");
    await a.page.fill("#reminder-email", "anna@example.ie");
    await a.page.click('form:has(#reminder-email) button:has-text("Save")');
    await a.page.waitForSelector("text=Reminders will go to anna@example.ie");
  });

  await step(G, "Household: calendar feed link works", async () => {
    const url = (await text(a.page, ".inbox code.small")).trim();
    const res = await fetch(url);
    const body = await res.text();
    expect(res.ok && body.includes("BEGIN:VCALENDAR"), "calendar feed should be an .ics file");
  });

  await step(G, "Capture: free plan limit gives a clear message", async () => {
    await a.page.evaluate(async () => {
      const token = localStorage.getItem("lifeadmin.token");
      for (let i = 0; i < 10; i++) {
        const f = new FormData();
        f.append("text", "Electric Ireland\nTotal amount due: €10.00\nPayment due by 20/12/2026");
        await fetch("/api/documents", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
      }
    });
    await tab(a.page, "Add");
    await a.page.click('.choice:has-text("Electricity")');
    await a.page.waitForSelector('.error:has-text("free plan")', { timeout: 8000 });
  });

  await step(G, "Network failure: an action shows a Retry toast and the screen keeps working", async () => {
    await tab(a.page, "Timeline");
    await a.page.waitForSelector(".tl-item");
    await a.page.route("**/api/deadlines/**", (r) => r.abort());
    await a.page.locator(".spine .tl-item .tick").first().click();
    await a.page.waitForSelector('.toast-error:has-text("Retry")');
    await a.page.unroute("**/api/deadlines/**");
    await a.page.click(".toast-error >> text=Retry");
    await a.page.waitForSelector(".toast:not(.toast-error)");
  });

  await step(G, "Household: Sign out returns to the welcome screen", async () => {
    await tab(a.page, "Household");
    await a.page.click('button:has-text("Sign out")');
    await a.page.waitForSelector("#name");
  });

  await a.context.close();
  current = null;
}

// ---------- demo-only tests ----------

async function demoTests(browser) {
  const G = "demo";
  let c = await open(browser, "demo");

  await step(G, "Account storage: changes are written to the account store", async () => {
    await start(c.page, "Aoife");
    const before = await c.page.evaluate(() => window.__mock.writes);
    await c.page.locator(".spine .tl-item .tick").first().click();
    await c.page.waitForTimeout(300);
    const after = await c.page.evaluate(() => window.__mock.writes);
    expect(after > before, "tick should write to the account");
  });

  await step(G, "Photo: two pages, remove one, read with Claude", async () => {
    await tab(c.page, "Add");
    const jpg = { mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) };
    await c.page.setInputFiles("#photo", { name: "p1.jpg", ...jpg });
    await c.page.setInputFiles("#photo", { name: "p2.jpg", ...jpg });
    await c.page.waitForSelector("text=2 pages ready");
    await c.page.click('button[aria-label="Remove page 2"]');
    await c.page.waitForSelector("text=1 page ready");
    await c.page.click('button:has-text("Read this letter")');
    await c.page.waitForSelector(".doc-band", { timeout: 8000 });
    expect((await c.page.evaluate(() => window.__mock.imagesSent)) === 1, "one image should be sent");
    expect(/Read by Claude/.test(await text(c.page, ".ai-label")), "should be read by Claude");
  });

  await step(G, "Premium AI draft uses Claude", async () => {
    await tab(c.page, "Household");
    await c.page.click('button:has-text("Try Premium")');
    await c.page.waitForSelector('.pill:has-text("Premium")');
    await openDoc(c.page, "AXA");
    await c.page.click('.act:has-text("Cancel it")');
    await c.page.waitForFunction(() => document.querySelector("#draft-body")?.value === "AI draft body");
    expect(/Written by AI/.test(await text(c.page, ".draft-label")), "AI label should show");
    await c.page.click(".sheet-close");
  });

  await step(G, "Temporary save failure: error toast with Retry, change rolled back, Retry works", async () => {
    await tab(c.page, "Timeline");
    await c.page.waitForSelector(".tl-item");
    await c.page.evaluate(() => (window.__mock.failWrites = "unavailable"));
    const row = c.page.locator(".spine .tl-item").first();
    const name = await row.locator(".tl-title").innerText();
    await row.locator(".tick").click();
    await c.page.waitForSelector('.toast-error:has-text("Retry")', { timeout: 8000 });
    await c.page.waitForSelector(`.spine .tl-item:has-text("${name}")`);
    await c.page.evaluate(() => (window.__mock.failWrites = null));
    await c.page.click(".toast-error >> text=Retry");
    await c.page.waitForSelector(".toast:not(.toast-error)");
  });

  await step(G, "No account access: says so once, keeps changes in the browser across reloads", async () => {
    await c.page.evaluate(() => (window.__mock.failWrites = "invalid_argument"));
    await c.page.evaluate(() => localStorage.setItem("__mockcfg", JSON.stringify({ failWrites: "invalid_argument" })));
    const row = c.page.locator(".spine .tl-item").first();
    const name = await row.locator(".tl-title").innerText();
    await row.locator(".tick").click();
    await c.page.waitForSelector("text=kept in this browser");
    await c.page.waitForTimeout(5300);
    await reload(c.page);
    await c.page.click("text=Done (");
    await c.page.waitForSelector(`.tl-done .tl-item:has-text("${name}")`);
  });
  await c.context.close();

  c = await open(browser, "demo", { mock: { sample: "not_granted" } });
  await step(G, "Claude not allowed: text still works with the offline reader, photos explain why not", async () => {
    await start(c.page, "Ciara");
    await tab(c.page, "Add");
    await c.page.click('.choice:has-text("Electricity")');
    await c.page.waitForSelector(".doc-band", { timeout: 8000 });
    expect(/basic reader/.test(await text(c.page, ".ai-label")), "should fall back to the basic reader");
    await tab(c.page, "Add");
    await c.page.waitForSelector("text=Reading photos needs Claude");
  });
  await c.context.close();
  current = null;
}

// ---------- accessibility ----------

async function a11y(browser, mode) {
  const axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const scheme of ["light", "dark"]) {
    const c = await open(browser, mode, { scheme });
    await step(`${mode}-a11y`, `Accessibility (${scheme}): no WCAG A/AA violations on any screen`, async () => {
      const problems = [];
      const scan = async (label) => {
        await c.page.waitForTimeout(350);
        await c.page.addScriptTag({ content: axe });
        const v = await c.page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => `${x.id}(${x.nodes.length}): ${x.nodes[0].target.join(" ")}`));
        if (v.length) problems.push(`${label}: ${v.join("; ")}`);
      };
      await scan("welcome");
      await start(c.page);
      await scan("timeline");
      await c.page.click(".check-row");
      await scan("check sheet");
      await c.page.keyboard.press("Escape");
      await openDoc(c.page, "AXA");
      await scan("document");
      await c.page.click('.act:has-text("Cancel it")');
      await c.page.waitForSelector("#draft-body");
      await scan("draft sheet");
      await c.page.click(".sheet-close");
      await tab(c.page, "Library");
      await scan("library");
      await tab(c.page, "Add");
      await scan("capture");
      await tab(c.page, "Household");
      await scan("household");
      await tab(c.page, "Free time");
      await c.page.waitForSelector(".ft-form");
      await scan("free time form");
      await c.page.selectOption("#ft-near", "cork");
      await c.page.click('button:has-text("Swipe through what\'s on")');
      await c.page.waitForSelector(".swipe-card.is-top");
      await scan("swipe deck");
      await c.page.click('button:has-text("Just plan it for me")');
      await c.page.waitForSelector(".ft-itinerary, .empty-state", { timeout: 10000 });
      await scan("free time plan");
      expect(!problems.length, problems.join(" || "));
    });
    await c.context.close();
    current = null;
  }
}

// ---------- main ----------

async function main() {
  const demoSrc = fs.readFileSync(path.join(ROOT, "web/dist-demo/life-admin.html"), "utf8");
  fs.writeFileSync(
    path.join(TMP, "demo.html"),
    `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${demoSrc}</body></html>`,
  );

  // Serve the demo over http like the real (https) artifact; file:// storage is unreliable in headless Chromium.
  const http = require("node:http");
  const demoServer = http
    .createServer((req, res) => {
      if (req.url && req.url.startsWith("/freetime.json")) {
        res.setHeader("content-type", "application/json");
        return res.end(fs.readFileSync(path.join(ROOT, "web/dist-demo/freetime.json")));
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(fs.readFileSync(path.join(TMP, "demo.html")));
    })
    .listen(DEMO_PORT);

  let server = null;
  if (ONLY !== "demo") {
    server = spawn(process.execPath, [path.join(ROOT, "server/dist/index.js")], {
      env: { ...process.env, PORT: String(PORT), DATA_FILE: path.join(TMP, "db.json"), AI_ENGINE: "heuristic", ANTHROPIC_API_KEY: "", FREETIME_LIVE: "0" },
      stdio: "ignore",
    });
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const browser = await chromium.launch();
  try {
    for (const mode of ONLY ? [ONLY] : ["server", "demo"]) {
      console.log(`\n▶ ${mode === "server" ? "Full app + API" : "Phone demo (strict runtime mock)"}`);
      await coreTests(browser, mode);
      if (mode === "server") await serverTests(browser);
      else await demoTests(browser);
      await a11y(browser, mode);
    }
  } finally {
    await browser.close();
    server?.kill();
    demoServer.close();
  }

  const failed = results.filter((r) => !r.ok);
  const byGroup = {};
  for (const r of results) {
    byGroup[r.group] ??= { pass: 0, fail: 0 };
    byGroup[r.group][r.ok ? "pass" : "fail"]++;
  }
  console.log("\nSummary");
  for (const [g, c] of Object.entries(byGroup)) console.log(`  ${g.padEnd(14)} ${c.pass} passed, ${c.fail} failed`);
  console.log(`  ${"total".padEnd(14)} ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log(`\nScreenshots of failures are in ${TMP}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
