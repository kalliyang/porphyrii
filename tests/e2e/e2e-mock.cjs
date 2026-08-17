/**
 * e2e-mock.cjs — intercepted E2E for the Porphyrii frontend.
 *
 * Verifies the full frontend pipeline against the DEPLOYED site with /api/*
 * responses fulfilled by deterministic mocks. Rationale: Cloudflare
 * Turnstile refuses automated browsers by design (verified 2026-08-17 in
 * both headless and headed Chrome), so no automated run can pass the real
 * challenge; the backend roundtrip itself was proven in C3. Here the
 * Turnstile execute call is stubbed client-side and everything downstream —
 * stage machine, rendering, integrity layer, quantity validator, IPA
 * toggle, IndexedDB history — runs for real in the page.
 *
 * Harness: playwright (ad-hoc dev harness, NOT a package.json dependency —
 * keep the repo zero-dependency; `npm install playwright` in a scratch dir
 * or use `npx playwright`). Screenshots land in tests/e2e/shots/ (ignored).
 *
 * Run:
 *   node tests/e2e/gen-mock.mjs   # once (or after core/ changes)
 *   node tests/e2e/e2e-mock.cjs [baseURL]   # default https://porphyrii.org/
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const BASE = process.argv[2] ?? "https://porphyrii.org/";
const contract = JSON.parse(
  fs.readFileSync(path.join(HERE, "mock-contract.json"), "utf8")
);
const elisionContract = JSON.parse(
  fs.readFileSync(path.join(HERE, "mock-elision.json"), "utf8")
);
const gold = JSON.parse(
  fs.readFileSync(
    path.join(HERE, "..", "golden", "aeneid-1-1-7.ipa-gold.json"),
    "utf8"
  )
);
const INPUT = contract.original_text_cleaned;

// C: flip line 1 "ma" short -> long (letters unchanged: the transport stays
// clean and the quantity validator must flag exactly this syllable)
const cFlip = JSON.parse(JSON.stringify(contract));
cFlip.scansion[0].feet[0][1].q = "long";

// D: model silently altered letters in the scansion text (Check B failure)
const cAltered = JSON.parse(JSON.stringify(contract));
cAltered.scansion_text = cAltered.scansion_text.replace("Arma", "Armis");

// E: declared spelling correction (warning path, UI.md §3.2). A letter is
// dropped so Check B sees a real diff (v/u variants normalize away, R-F6).
const cCorrected = JSON.parse(JSON.stringify(contract));
cCorrected.spelling_corrected = true;
cCorrected.correction_reason = "Read “Lauinaque” as a misspelling of “Laviniaque”.";
cCorrected.scansion_text = cCorrected.scansion_text.replace("Lāvīniaque", "Lāvīnaque");

const variants = { happy: contract, flip: cFlip, alter: cAltered, corrected: cCorrected, elision: elisionContract };
let mode = "happy";
const out = { checks: {} };

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    // page.route() cannot intercept fetches the service worker makes on the
    // page's behalf (sw.js passes /api/* through via its own fetch). The SW
    // itself is covered by e2e-live.cjs; the functional mocks block it.
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => (out.pageerror = String(e)));

  await page.route("**/api/validate", (route) => {
    if (mode === "reject") {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          reject_reason:
            "This text is mostly not in the Latin alphabet. Porphyrii analyzes Classical Latin only.",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, input_has_macron: false }),
    });
  });
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(variants[mode] ?? contract),
    })
  );

  const stubTurnstile = () =>
    page.evaluate(() => {
      // Whole-object replacement: the real turnstile object's methods may be
      // non-writable; main.js looks up window.turnstile.execute at call time.
      Object.defineProperty(window, "turnstile", {
        configurable: true,
        writable: true,
        value: {
          render: () => "stub-widget",
          execute: (el, cbs) => cbs.callback("stub-token"),
          reset: () => {},
        },
      });
    });
  const shots = (name) => path.join(HERE, "shots", name);

  // ---- happy path (first — history starts empty) ----
  mode = "happy";
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1200);
  await stubTurnstile();
  await page.fill("#input-text", INPUT);
  await page.click("#analyze-btn");
  await page.waitForSelector("#result-section:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(600);
  const c = out.checks;
  c.meterBadge = await page.textContent("#meter-badge");
  c.scansionLines = await page.locator("#scansion-body .scansion-line").count();
  c.line1Feet = await page.locator("#scansion-body .scansion-line").first().locator(".foot").count();
  c.validatorWarnings = ((await page.textContent("#validator-warnings")) || "").trim() || null;
  c.translationShown = ((await page.textContent("#translation-body")) || "").includes("Arms and the man");
  await page.screenshot({ path: shots("10-mock-happy.png"), fullPage: true });

  await page.check("#ipa-toggle");
  await page.waitForTimeout(400);
  c.ipaLine1 = (await page.locator("#ipa-body .ipa-line").first().textContent()) || null;
  c.ipaLine1IsGold = c.ipaLine1 === gold.lines[0].expected_ipa;
  await page.screenshot({ path: shots("11-mock-ipa.png") });

  await page.waitForTimeout(2200);
  c.historyCount = ((await page.textContent("#history-count")) || "").trim();
  await page.click("#history-details summary");
  c.historyItems = await page.locator("#history-list .history-item").count();
  await page.click("#history-list .history-item .history-open");
  await page.waitForTimeout(600);
  c.historyReopenLines = await page.locator("#scansion-body .scansion-line").count();

  // ---- rejection (precheck-style 400, verbatim reason, input preserved) ----
  mode = "reject";
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await stubTurnstile();
  await page.fill("#input-text", "这是一段中文文本，完全不是拉丁语。");
  await page.click("#analyze-btn");
  await page.waitForSelector("#form-alerts .alert", { timeout: 15000 });
  c.rejectAlert = ((await page.textContent("#form-alerts")) || "").trim();
  c.rejectInputPreserved = await page.evaluate(() => document.getElementById("input-text").value);
  await page.screenshot({ path: shots("13-mock-rejected.png") });

  // ---- validator warning ----
  mode = "flip";
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await stubTurnstile();
  await page.fill("#input-text", INPUT);
  await page.click("#analyze-btn");
  await page.waitForSelector("#result-section:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(400);
  c.validatorWarningText = ((await page.textContent("#validator-warnings")) || "").trim() || null;
  c.lineNotes = await page.locator("#scansion-body .line-note").allTextContents();
  await page.screenshot({ path: shots("14-mock-validator-warning.png"), fullPage: true });

  // ---- integrity mismatch + toggleable diff ----
  mode = "alter";
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await stubTurnstile();
  await page.fill("#input-text", INPUT);
  await page.click("#analyze-btn");
  await page.waitForSelector("#result-section:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(400);
  c.integrityError = ((await page.textContent("#result-alerts")) || "").trim();
  await page.click("#result-alerts .alert .btn"); // Show diff
  await page.waitForTimeout(300);
  c.diffRows = await page.locator("#result-alerts .diff-list li").allTextContents();
  await page.screenshot({ path: shots("15-mock-integrity-diff.png"), fullPage: true });

  // ---- spelling-corrected warning (never an error) ----
  mode = "corrected";
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await stubTurnstile();
  await page.fill("#input-text", INPUT);
  await page.click("#analyze-btn");
  await page.waitForSelector("#result-section:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(400);
  c.correctedAlertClass = await page.locator("#result-alerts .alert").first().getAttribute("class");
  c.correctedNoErrorAlert = (await page.locator("#result-alerts .alert-error").count()) === 0;
  await page.screenshot({ path: shots("16-mock-corrected.png"), fullPage: true });

  // ---- elision regression (F-W6-1, W7): Aen. 1.3 double elision + liaison.
  // The repaired transport must produce NO validator warnings, and the
  // in-browser IPA must equal the golden corpus line 3 character-for-character.
  mode = "elision";
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(800);
  await stubTurnstile();
  await page.fill("#input-text", elisionContract.original_text_cleaned);
  await page.click("#analyze-btn");
  await page.waitForSelector("#result-section:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(400);
  c.elisionValidatorWarnings = ((await page.textContent("#validator-warnings")) || "").trim() || null;
  c.elisionLineNotes = await page.locator("#scansion-body .line-note").allTextContents();
  c.elisionElidedRendered = await page.locator("#scansion-body .syl.elided").count();
  await page.check("#ipa-toggle");
  await page.waitForTimeout(400);
  c.elisionIpa = (await page.locator("#ipa-body .ipa-line").first().textContent()) || null;
  c.elisionIpaIsGold = c.elisionIpa === gold.lines[2].expected_ipa;
  c.elisionIpaFallbackNote = (await page.locator("#ipa-body .line-note").count()) > 0;
  await page.screenshot({ path: shots("17-mock-elision.png"), fullPage: true });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => {
  out.fatal = String(e);
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
});
