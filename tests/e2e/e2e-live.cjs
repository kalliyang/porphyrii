/**
 * e2e-live.cjs — live smoke E2E against the deployed site (real Turnstile,
 * real service worker, no mocks).
 *
 * What this CAN verify unattended: initial render, fonts, SW registration,
 * manifest, language attributes, theme toggle + persistence, About overlay,
 * the offline degradation path, and the Turnstile challenge-failure error
 * presentation. What it CANNOT: any path past Turnstile — Cloudflare
 * refuses automated browsers by design (verified 2026-08-17, headless and
 * headed Chrome alike), so the rejection/solver paths report the
 * challenge-failure alert here. Use e2e-mock.cjs for those, plus one
 * manual pass before release (PRD §9 E2E row).
 *
 * Harness: playwright (ad-hoc dev harness, NOT a package.json dependency).
 * Run: node tests/e2e/e2e-live.cjs [baseURL]
 */
const { chromium } = require("playwright");
const path = require("node:path");

const BASE = process.argv[2] ?? "https://porphyrii.org/";
const shots = (name) => path.join(__dirname, "shots", name);
const out = { checks: {}, consoleErrors: [] };

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    // Turnstile emits telemetry console errors by itself; filter that noise.
    if (m.type() === "error" && !m.text().startsWith("%c%d")) {
      out.consoleErrors.push(m.text());
    }
  });
  page.on("pageerror", (e) => out.consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2000);
  const c = out.checks;
  c.title = await page.title();
  c.fonts = await page.evaluate(() =>
    [...document.fonts].map((f) => `${f.family}:${f.status}`)
  );
  c.swScope = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const r = await navigator.serviceWorker.getRegistration();
    return r ? r.scope : null;
  });
  c.manifest = await page.evaluate(
    () => document.querySelector('link[rel="manifest"]')?.href ?? null
  );
  c.htmlLang = await page.evaluate(() => document.documentElement.lang);
  c.textareaLang = await page.evaluate(
    () => document.getElementById("input-text").getAttribute("lang")
  );
  c.inputFontSize = await page.evaluate(
    () => getComputedStyle(document.getElementById("input-text")).fontSize
  );
  c.cancelHiddenWhenIdle = await page.evaluate(
    () => getComputedStyle(document.getElementById("cancel-btn")).display === "none"
  );
  await page.screenshot({ path: shots("01-initial-light.png"), fullPage: true });

  await page.click("#theme-toggle");
  c.themeAfterToggle = await page.evaluate(() => document.documentElement.dataset.theme);
  c.themePersisted = await page.evaluate(() => localStorage.getItem("ds-theme"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: shots("02-dark.png"), fullPage: true });
  await page.click("#theme-toggle");

  await page.click("#about-open");
  c.aboutVisible = await page.evaluate(() => !document.getElementById("about-view").hidden);
  await page.screenshot({ path: shots("03-about.png"), fullPage: true });
  await page.keyboard.press("Escape");
  c.aboutClosedByEsc = await page.evaluate(() => document.getElementById("about-view").hidden);

  // Offline degradation (client-side guard + banner; history stays readable)
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  c.offlineBanner = await page.evaluate(
    () => !document.querySelector(".offline-banner").hidden
  );
  await page.fill("#input-text", "Gallia est omnis divisa in partes tres");
  await page.click("#analyze-btn");
  await page.waitForSelector("#form-alerts .alert", { timeout: 10000 });
  c.offlineAlert = ((await page.textContent("#form-alerts")) || "").trim();
  await page.screenshot({ path: shots("07-offline.png"), fullPage: true });
  await ctx.setOffline(false);

  // Mobile viewport
  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const mp = await mob.newPage();
  await mp.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await mp.waitForTimeout(1200);
  await mp.screenshot({ path: shots("08-mobile.png"), fullPage: true });
  await mob.close();

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => {
  out.fatal = String(e);
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
});
