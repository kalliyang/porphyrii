/**
 * main.js — the orchestrator, and the ONLY DOM-manipulation layer (PRD §8).
 *
 * Everything it renders comes from pure modules:
 *   app/scansion-view.js   view models for the scansion card
 *   app/ipa.js             contract -> IPA (G2P + override transport)
 *   app/audio.js           recitation state machine (driver lands in C7)
 *   app/turnstile.js       invisible-widget wrapper (dual-phase tokens)
 *   app/db.js              IndexedDB history
 *   services/text-integrity.js  R-F6 two-level check + diff (isomorphic)
 *   core/latin-quantity.js      R-F14 self-consistency validator
 *
 * LLM output is NEVER injected as HTML (PRD §10-5): every string goes
 * through textContent.
 */

import {
  buildScansionView,
  validatorNotices,
} from "./app/scansion-view.js";
import { deriveIpa } from "./app/ipa.js";
import { AudioController } from "./app/audio.js";
import { TurnstileManager } from "./app/turnstile.js";
import { saveScansion, getHistory, deleteRecord } from "./app/db.js";
import { verifyIntegrity } from "./services/text-integrity.js";
import { validateScansion } from "./core/latin-quantity.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Public Turnstile sitekey (safe to embed — it is public by design). */
const TURNSTILE_SITEKEY = "0x4AAAAAAEQyuSblT5gS5ZHf";
const MAX_INPUT = 2000;

/** Analysis-flow stage copy (UI.md §3.1, SPEC §6.5: feedback for >300 ms).
 *  The analyze endpoint's worst case is 3–4 minutes (schema retry plus a
 *  cross-vendor fallback that alone can wait 100 s+), so the copy keeps
 *  advancing instead of leaving a dead spinner. */
const STAGE_VALIDATING = "Checking input…";
const STAGE_ANALYZING = [
  { atMs: 0, text: "Restoring macrons & scanning meter…" },
  { atMs: 20_000, text: "Still working — the engine is reasoning through your passage…" },
  { atMs: 60_000, text: "Taking longer than usual — the fallback provider may be handling your request…" },
  { atMs: 120_000, text: "Complex passage — analysis can take up to 3–4 minutes. Thank you for your patience…" },
];

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  input: $("input-text"),
  charCounter: $("char-counter"),
  analyzeBtn: $("analyze-btn"),
  cancelBtn: $("cancel-btn"),
  stageStatus: $("stage-status"),
  formAlerts: $("form-alerts"),
  resultSection: $("result-section"),
  resultAlerts: $("result-alerts"),
  validatorWarnings: $("validator-warnings"),
  meterBadge: $("meter-badge"),
  confidenceNote: $("confidence-note"),
  scansionBody: $("scansion-body"),
  translationBody: $("translation-body"),
  grammarBody: $("grammar-body"),
  playBtn: $("play-btn"),
  playLabel: $("play-label"),
  audioStatus: $("audio-status"),
  ipaToggle: $("ipa-toggle"),
  ipaBody: $("ipa-body"),
  historyDetails: $("history-details"),
  historyCount: $("history-count"),
  historyList: $("history-list"),
  themeToggle: $("theme-toggle"),
  aboutOpen: $("about-open"),
  aboutView: $("about-view"),
  aboutClose: $("about-close"),
  turnstileContainer: $("turnstile-container"),
};

// ---------------------------------------------------------------------------
// Small DOM helpers (textContent only — never innerHTML with model output)
// ---------------------------------------------------------------------------

function el(tag, { className, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Plain-text block -> <p> per blank-line-separated paragraph (PRD §10-5). */
function renderPlainText(container, text) {
  clear(container);
  for (const para of String(text ?? "").split(/\n\s*\n/)) {
    const trimmed = para.trim();
    if (trimmed) container.appendChild(el("p", { text: trimmed }));
  }
}

/**
 * Alert builder (SPEC §6.4 / UI.md §4 mapping).
 * @param {HTMLElement} container
 * @param {"error"|"warning"|"success"} kind
 * @param {object} o { title, message, diff, onRetry, autoDismissMs }
 */
function showAlert(container, kind, o = {}) {
  const box = el("div", { className: `alert alert-${kind}`, attrs: { role: kind === "error" ? "alert" : "status" } });
  if (o.title) box.appendChild(el("strong", { className: "alert-title", text: o.title }));
  if (o.message) box.appendChild(el("span", { text: o.message }));
  if (Array.isArray(o.diff)) {
    const list = el("ul", { className: "diff-list" });
    for (const row of o.diff) {
      const li = el("li", { className: `diff-${row.type}`, text: row.text === "" ? " " : row.text });
      if (row.type === "del") li.prepend(el("span", { text: "− " }));
      if (row.type === "add") li.prepend(el("span", { text: "+ " }));
      list.appendChild(li);
    }
    box.appendChild(list);
  }
  if (typeof o.onRetry === "function") {
    const btn = el("button", { className: "btn btn-secondary", text: "Retry", attrs: { type: "button" } });
    btn.addEventListener("click", o.onRetry);
    box.appendChild(btn);
  }
  container.appendChild(box);
  if (o.autoDismissMs) {
    setTimeout(() => box.remove(), o.autoDismissMs);
  }
  return box;
}

// ---------------------------------------------------------------------------
// Theme toggle (SPEC §7; ds-theme is the ONLY localStorage use)
// ---------------------------------------------------------------------------

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

els.themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("ds-theme", next);
  } catch {
    /* storage unavailable — theme simply won't persist */
  }
});

// ---------------------------------------------------------------------------
// Turnstile (dual-phase tokens, PRD §7.1 / UI.md §3.1)
// ---------------------------------------------------------------------------

let turnstile = null;
let turnstileFailed = false;

window.__porTurnstileReady = () => {
  try {
    turnstile = new TurnstileManager({
      sitekey: TURNSTILE_SITEKEY,
      container: els.turnstileContainer,
    });
    turnstile.render();
  } catch {
    turnstileFailed = true;
  }
};

/** Fresh single-use token, or a user-facing Error. */
async function humanToken() {
  if (turnstileFailed || (turnstile === null && typeof window.turnstile === "undefined")) {
    throw new Error(
      "Human verification could not load (a content blocker may be blocking Cloudflare). Please allow challenges.cloudflare.com and reload."
    );
  }
  if (turnstile === null) window.__porTurnstileReady();
  return turnstile.getToken();
}

// ---------------------------------------------------------------------------
// Analysis state machine (UI.md §3.1)
// ---------------------------------------------------------------------------

let flowState = "idle"; // idle | validating | analyzing | rendering | done | rejected | error
let abortController = null;
let stageTimers = [];

function setStage(text, withSpinner) {
  clear(els.stageStatus);
  if (!text) return;
  if (withSpinner) els.stageStatus.appendChild(el("span", { className: "spinner", attrs: { "aria-hidden": "true" } }));
  els.stageStatus.appendChild(el("span", { text }));
}

function clearStageTimers() {
  for (const t of stageTimers) clearTimeout(t);
  stageTimers = [];
}

function scheduleAnalyzingStages() {
  clearStageTimers();
  for (const { atMs, text } of STAGE_ANALYZING) {
    stageTimers.push(setTimeout(() => {
      if (flowState === "analyzing") setStage(text, true);
    }, atMs));
  }
}

function setBusy(busy) {
  els.analyzeBtn.disabled = busy || !inputValid();
  els.cancelBtn.hidden = !busy;
  if (!busy) {
    clearStageTimers();
    setStage("");
  }
}

function inputValid() {
  const len = els.input.value.trim().length;
  return len > 0 && els.input.value.length <= MAX_INPUT;
}

async function postJson(url, body, signal) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON error body — handled via status below */
  }
  return { status: resp.status, data, retryAfter: resp.headers.get("Retry-After") };
}

function offlineError() {
  return !navigator.onLine;
}

function showFlowError(message) {
  flowState = "error";
  setBusy(false);
  showAlert(els.formAlerts, "error", {
    title: "Analysis failed",
    message,
    onRetry: () => {
      clear(els.formAlerts);
      void onAnalyze();
    },
  });
}

async function onAnalyze() {
  if (flowState === "validating" || flowState === "analyzing") return;
  clear(els.formAlerts);
  const text = els.input.value;

  if (text.trim().length === 0) {
    showAlert(els.formAlerts, "error", { title: "Nothing to analyze", message: "Please enter some Latin text first." });
    return;
  }
  if (text.length > MAX_INPUT) {
    showAlert(els.formAlerts, "error", {
      title: "Text too long",
      message: `Porphyrii accepts at most ${MAX_INPUT.toLocaleString("en-US")} characters (about 25 hexameter lines). Please shorten your selection.`,
    });
    return;
  }
  if (offlineError()) {
    showAlert(els.formAlerts, "error", {
      title: "You are offline",
      message: "Analysis needs a network connection. Your saved history below still works offline.",
    });
    return;
  }

  abortController = new AbortController();

  // ---- phase 1: validating ----
  flowState = "validating";
  setBusy(true);
  setStage(STAGE_VALIDATING, true);
  let token1;
  try {
    token1 = await humanToken();
  } catch (err) {
    showFlowError(String(err.message ?? err));
    return;
  }
  let v;
  try {
    v = await postJson("/api/validate", { text, turnstile_token: token1 }, abortController.signal);
  } catch (err) {
    if (err?.name === "AbortError") return resetToIdle();
    showFlowError(offlineMessage());
    return;
  }
  if (v.status === 200 && v.data?.ok) {
    // ---- phase 2: analyzing ----
    flowState = "analyzing";
    scheduleAnalyzingStages();
    let token2;
    try {
      token2 = await humanToken();
    } catch (err) {
      showFlowError(String(err.message ?? err));
      return;
    }
    let a;
    try {
      a = await postJson("/api/analyze", { text, turnstile_token: token2 }, abortController.signal);
    } catch (err) {
      if (err?.name === "AbortError") return resetToIdle();
      showFlowError(offlineMessage());
      return;
    }
    if (a.status === 200 && a.data) {
      flowState = "rendering";
      setBusy(false);
      renderResult(a.data, { input: text, save: true });
      flowState = "done";
      return;
    }
    showFlowError(backendMessage(a, "The analysis engine could not produce a valid result this time. Please try again in a moment."));
    return;
  }

  // validate did not pass
  if (v.status === 400 && v.data?.reject_reason) {
    flowState = "rejected";
    setBusy(false);
    showAlert(els.formAlerts, "error", {
      title: "This text can't be analyzed",
      message: v.data.reject_reason, // backend copy is user-facing by contract
    });
    return;
  }
  showFlowError(backendMessage(v, "The validation service is temporarily unavailable. Please try again in a moment."));
}

function backendMessage(resp, fallback) {
  const base = resp?.data?.reject_reason ?? fallback;
  if (resp?.status === 429 || resp?.status === 503) {
    const secs = Number(resp.retryAfter);
    if (Number.isFinite(secs) && secs > 0) {
      const mins = Math.max(1, Math.ceil(secs / 60));
      return `${base} You can retry in about ${mins} minute${mins === 1 ? "" : "s"}.`;
    }
  }
  return base;
}

function offlineMessage() {
  return offlineError()
    ? "You are offline — analysis needs a network connection. Your saved history below still works offline."
    : "The network request failed. Please check your connection and try again.";
}

function resetToIdle() {
  flowState = "idle";
  setBusy(false);
}

els.analyzeBtn.addEventListener("click", () => void onAnalyze());
els.cancelBtn.addEventListener("click", () => {
  abortController?.abort();
  resetToIdle();
});

// ---------------------------------------------------------------------------
// Result rendering
// ---------------------------------------------------------------------------

let currentResult = null; // { contract, input }
let currentIpa = null;    // cached deriveIpa() result for the visible result
const audio = new AudioController();

function renderResult(contract, { input, save }) {
  currentResult = { contract, input };
  currentIpa = null;
  els.ipaToggle.checked = false;
  els.ipaBody.hidden = true;
  clear(els.resultAlerts);
  clear(els.validatorWarnings);

  // --- integrity layer (PRD R-F6, UI.md §3.2): degraded display, never blocking ---
  let integrity = null;
  try {
    integrity = verifyIntegrity({
      userInput: input,
      originalTextCleaned: contract.original_text_cleaned,
      scansionText: contract.scansion_text,
      spellingCorrected: contract.spelling_corrected === true,
    });
  } catch {
    integrity = null; // the check must never break result rendering
  }

  if (contract.spelling_corrected === true) {
    // Expected-correction mismatch renders as WARNING, not error (UI.md §3.2).
    showAlert(els.resultAlerts, "warning", {
      title: "Spelling corrected",
      message: contract.correction_reason ?? "The model corrected what it read as a spelling error.",
      diff: integrity?.checkB?.diff ?? undefined,
    });
  } else if (integrity && integrity.status === "fail") {
    const box = showAlert(els.resultAlerts, "error", {
      title: "The model altered your input text",
      message: "The scansion below may not match your verse. ",
    });
    const toggle = el("button", { className: "btn btn-secondary", text: "Show diff", attrs: { type: "button" } });
    let shown = false;
    toggle.addEventListener("click", () => {
      shown = !shown;
      toggle.textContent = shown ? "Hide diff" : "Show diff";
      const existing = box.querySelector(".diff-list");
      if (existing) existing.remove();
      if (shown) {
        const which = !integrity.checkA.ok ? integrity.checkA : integrity.checkB;
        const label = el("span", {
          className: "alert-title",
          text: !integrity.checkA.ok
            ? "Your input vs. the text the model read:"
            : "The model's reading vs. its scansion text:",
        });
        const list = el("ul", { className: "diff-list" });
        for (const row of which.diff ?? []) {
          const li = el("li", { className: `diff-${row.type}`, text: row.text === "" ? " " : row.text });
          if (row.type === "del") li.prepend(el("span", { text: "− " }));
          if (row.type === "add") li.prepend(el("span", { text: "+ " }));
          list.appendChild(li);
        }
        box.appendChild(label);
        box.appendChild(list);
      }
    });
    box.appendChild(toggle);
  }

  // --- quantity validator (PRD R-F14, UI.md §6): consistency warnings ---
  let notices = [];
  try {
    const validation = validateScansion(contract);
    notices = validatorNotices(validation);
  } catch {
    notices = []; // validator failure must never block the result
  }
  if (notices.length > 0) {
    const box = showAlert(els.validatorWarnings, "warning", {
      title: "Consistency check",
      message:
        "The syllable-quantity validator found points where the scansion disagrees with the restored macrons. Review these lines against your textbook:",
    });
    const list = el("ul", { className: "diff-list" });
    for (const n of notices) {
      list.appendChild(el("li", { text: `Line ${n.line}: ${n.message}` }));
    }
    box.appendChild(list);
  }

  // --- scansion card ---
  const view = buildScansionView(contract);
  els.meterBadge.textContent = view.meterLabel;
  if (view.confidenceNotice) {
    els.confidenceNote.hidden = false;
    els.confidenceNote.textContent = view.confidenceNotice;
  } else {
    els.confidenceNote.hidden = true;
    els.confidenceNote.textContent = "";
  }
  const noticeByLine = new Map();
  for (const n of notices) {
    noticeByLine.set(n.line, [...(noticeByLine.get(n.line) ?? []), n.message]);
  }
  renderScansionBody(view, noticeByLine);

  // --- translation & grammar ---
  renderPlainText(els.translationBody, contract.translation);
  renderPlainText(els.grammarBody, contract.grammar_notes);

  // --- recitation ---
  renderAudioState(audio.state);

  els.resultSection.hidden = false;
  els.resultSection.scrollIntoView({ block: "start" });

  if (save) void persistHistory(contract, input);
}

function renderScansionBody(view, noticeByLine) {
  clear(els.scansionBody);
  for (const line of view.lines) {
    const wrap = el("div", { className: "scansion-line" });
    if (view.prose || line.feet.length === 0) {
      wrap.appendChild(el("p", { className: "prose-line", text: line.text, attrs: { lang: "la" } }));
    } else {
      const head = el("div");
      head.appendChild(el("span", { className: "line-no", text: String(line.line), attrs: { "aria-hidden": "true" } }));
      const pattern = line.feet
        .map((f) => f.syllables.map((s) => s.mark).join(" "))
        .join(" | ");
      const feet = el("span", {
        className: "feet",
        attrs: { "aria-label": `Line ${line.line} metrical pattern: ${pattern}` },
      });
      for (const foot of line.feet) {
        const footEl = el("span", {
          className: "foot",
          attrs: foot.type ? { title: foot.type } : {},
        });
        for (const syl of foot.syllables) {
          const sylEl = el("span", { className: syl.elided ? "syl elided" : "syl" });
          sylEl.appendChild(el("span", { className: "syl-text", text: syl.display, attrs: { lang: "la" } }));
          sylEl.appendChild(el("span", { className: "syl-mark", text: syl.mark, attrs: { "aria-hidden": "true" } }));
          footEl.appendChild(sylEl);
        }
        feet.appendChild(footEl);
      }
      head.appendChild(feet);
      wrap.appendChild(head);
    }
    if (line.note) {
      wrap.appendChild(el("p", { className: "line-note", text: line.note }));
    }
    for (const msg of noticeByLine.get(line.line) ?? []) {
      wrap.appendChild(el("p", { className: "line-note", text: `Consistency check: ${msg}` }));
    }
    els.scansionBody.appendChild(wrap);
  }
}

// ---------------------------------------------------------------------------
// IPA toggle (SPEC §8.5 text alternative for audio)
// ---------------------------------------------------------------------------

function ensureIpa() {
  if (currentIpa === null && currentResult) {
    currentIpa = deriveIpa(currentResult.contract);
  }
  return currentIpa;
}

els.ipaToggle.addEventListener("change", () => {
  if (!els.ipaToggle.checked) {
    els.ipaBody.hidden = true;
    return;
  }
  const ipa = ensureIpa();
  clear(els.ipaBody);
  if (!ipa || !ipa.ok) {
    els.ipaBody.appendChild(
      el("p", { className: "ipa-line", text: "IPA transcription is unavailable for this result." })
    );
  } else {
    for (const line of ipa.lines) {
      els.ipaBody.appendChild(
        el("p", { className: "ipa-line", text: line.ipa, attrs: { lang: "la" } })
      );
    }
    if (ipa.problems.length > 0) {
      els.ipaBody.appendChild(
        el("p", {
          className: "line-note",
          text: "Some solver syllabifications could not be transported to the pronunciation engine; those words use the engine's own syllabification.",
        })
      );
    }
  }
  els.ipaBody.hidden = false;
});

// ---------------------------------------------------------------------------
// Recitation (UI.md §3.3 — state machine live, driver seam lands in C7)
// ---------------------------------------------------------------------------

function renderAudioState(state) {
  const btn = els.playBtn;
  switch (state) {
    case "unloaded":
      btn.disabled = false;
      els.playLabel.textContent = "Play";
      els.audioStatus.textContent = "";
      break;
    case "loading":
      btn.disabled = true;
      els.playLabel.textContent = "Loading";
      els.audioStatus.textContent = "Loading the pronunciation engine (one-time download)…";
      break;
    case "ready":
      btn.disabled = false;
      els.playLabel.textContent = "Play";
      els.audioStatus.textContent = "";
      break;
    case "playing":
      btn.disabled = false;
      els.playLabel.textContent = "Stop";
      els.audioStatus.textContent = "Playing…";
      break;
    case "load-error":
      btn.disabled = false;
      els.playLabel.textContent = "Retry";
      els.audioStatus.textContent = offlineError()
        ? "Pronunciation requires a one-time download — reconnect and retry."
        : "The recitation engine is not available yet (it ships with the beta). The IPA transcription below works now.";
      break;
  }
}

audio.onStateChange(renderAudioState);

els.playBtn.addEventListener("click", () => {
  if (!currentResult) return;
  const ipa = ensureIpa();
  if (!ipa || !ipa.ok) {
    els.audioStatus.textContent = "Pronunciation is unavailable for this result.";
    return;
  }
  void audio.play(ipa.lines.map((l) => l.ipa).join("\n"));
});

// ---------------------------------------------------------------------------
// History (IndexedDB, PRD R-F9)
// ---------------------------------------------------------------------------

async function persistHistory(contract, input) {
  const snippet = (input.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
  try {
    await saveScansion({
      createdAt: new Date().toISOString(),
      input,
      meter: contract.meter ?? "unknown",
      meterConfidence: contract.meter_confidence ?? "low",
      snippet,
      result: contract,
    });
    showAlert(els.resultAlerts, "success", {
      title: "Saved to history",
      message: "Stored in this browser only.",
      autoDismissMs: 2000,
    });
  } catch {
    /* history is best-effort; the result itself is already on screen */
  }
  await refreshHistory();
}

function historyItemNode(record) {
  const item = el("li", { className: "history-item" });
  const open = el("button", { className: "history-open", attrs: { type: "button" } });
  open.appendChild(el("span", { className: "history-snippet", text: record.snippet || "(untitled)", attrs: { lang: "la" } }));
  const when = new Date(record.createdAt);
  const stamp = Number.isNaN(when.getTime()) ? "" : when.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  open.appendChild(
    el("span", { className: "history-meta", text: `${stamp} · ${record.meter.replace(/_/g, " ")}` })
  );
  open.addEventListener("click", () => {
    els.input.value = record.input;
    updateCounter();
    renderResult(record.result, { input: record.input, save: false });
  });
  const del = el("button", {
    className: "btn btn-secondary",
    text: "Delete",
    attrs: { type: "button", "aria-label": `Delete history entry “${record.snippet || "untitled"}”` },
  });
  del.addEventListener("click", async () => {
    await deleteRecord(record.id);
    await refreshHistory();
  });
  item.appendChild(open);
  item.appendChild(del);
  return item;
}

async function refreshHistory() {
  let records = [];
  try {
    records = await getHistory(50);
  } catch {
    records = [];
  }
  clear(els.historyList);
  els.historyCount.textContent = records.length > 0 ? `(${records.length})` : "";
  if (records.length === 0) {
    els.historyList.appendChild(
      el("li", { className: "history-empty", text: "No saved analyses yet — results are stored here automatically." })
    );
    return;
  }
  for (const r of records) els.historyList.appendChild(historyItemNode(r));
}

// ---------------------------------------------------------------------------
// About & Privacy overlay
// ---------------------------------------------------------------------------

function openAbout() {
  els.aboutView.hidden = false;
  document.body.style.overflow = "hidden";
  els.aboutClose.focus();
}
function closeAbout() {
  els.aboutView.hidden = true;
  document.body.style.overflow = "";
  els.aboutOpen.focus();
}
els.aboutOpen.addEventListener("click", openAbout);
els.aboutClose.addEventListener("click", closeAbout);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.aboutView.hidden) closeAbout();
});

// ---------------------------------------------------------------------------
// Offline banner (SPEC §9.4: explicit degradation, never silent)
// ---------------------------------------------------------------------------

const offlineBanner = el("div", {
  className: "offline-banner",
  text: "You are offline — analysis is unavailable, but your saved history below still works.",
  attrs: { role: "status", hidden: "" },
});
document.querySelector(".site-header").after(offlineBanner);

function updateOnlineState() {
  offlineBanner.hidden = navigator.onLine;
}
window.addEventListener("online", updateOnlineState);
window.addEventListener("offline", updateOnlineState);

// ---------------------------------------------------------------------------
// Input counter (R-F1)
// ---------------------------------------------------------------------------

function updateCounter() {
  const len = els.input.value.length;
  els.charCounter.textContent = `${len.toLocaleString("en-US")} / ${MAX_INPUT.toLocaleString("en-US")}`;
  const over = len > MAX_INPUT;
  els.charCounter.classList.toggle("over-limit", over);
  els.analyzeBtn.disabled = over || els.input.value.trim().length === 0 ||
    flowState === "validating" || flowState === "analyzing";
}
els.input.addEventListener("input", updateCounter);

// ---------------------------------------------------------------------------
// Service worker + init
// ---------------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW is progressive enhancement — the app works without it */
    });
  });
}

updateCounter();
updateOnlineState();
void refreshHistory();
