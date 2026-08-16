/**
 * Unit tests for functions/_lib/precheck.js (PRD R-F3 programmatic prechecks).
 *
 * Run: node --test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  precheck,
  hasMacron,
  MAX_INPUT_CHARS,
} from "../../functions/_lib/precheck.js";

test("hasMacron: precomposed macrons and breves", () => {
  assert.equal(hasMacron("canō"), true);
  assert.equal(hasMacron("Ārma"), true);
  assert.equal(hasMacron("ȳ"), true);
  assert.equal(hasMacron("ă"), true); // precomposed breve counts as marked
  assert.equal(hasMacron("cano"), false);
});

test("hasMacron: combining marks U+0304 / U+0306", () => {
  assert.equal(hasMacron("cano\u0304"), true); // o + combining macron
  assert.equal(hasMacron("a\u0306rma"), true); // a + combining breve
  assert.equal(hasMacron("á"), false); // acute accent is not a quantity mark
});

test("precheck: plain Latin verse passes, has_macron=false", () => {
  const r = precheck("Arma virumque cano, Troiae qui primus ab oris");
  assert.equal(r.ok, true);
  assert.equal(r.has_macron, false);
});

test("precheck: macronized input detected", () => {
  const r = precheck("Arma virumque canō, Troiae quī prīmus ab ōrīs");
  assert.equal(r.ok, true);
  assert.equal(r.has_macron, true);
});

test("precheck: non-string and empty rejected", () => {
  assert.equal(precheck(undefined).ok, false);
  assert.equal(precheck(null).ok, false);
  assert.equal(precheck(42).ok, false);
  assert.equal(precheck("   \n\t ").ok, false);
});

test("precheck: length cap at 2000 chars", () => {
  assert.equal(precheck("a".repeat(MAX_INPUT_CHARS)).ok, true);
  const r = precheck("a".repeat(MAX_INPUT_CHARS + 1));
  assert.equal(r.ok, false);
  assert.match(r.reason, /too long/);
});

test("precheck: control characters rejected", () => {
  assert.equal(precheck("abc\u0000def").ok, false);
  assert.equal(precheck("abc\u001Bdef").ok, false);
  assert.equal(precheck("abc\u007Fdef").ok, false);
  // \n and \t are fine
  assert.equal(precheck("arma\nvirumque\tcano").ok, true);
});

test("precheck: CJK / Greek / numbers-only rejected by script gate", () => {
  assert.equal(precheck("拉丁语诗歌分析测试文本").ok, false);
  assert.equal(precheck("μῆνιν ἄειδε θεὰ Πηληϊάδεω Ἀχιλῆος").ok, false);
  assert.equal(precheck("12345 67890 !!!").ok, false);
});

test("precheck: mostly-Latin text with some digits passes the gate", () => {
  const r = precheck("Arma virumque cano 123");
  assert.equal(r.ok, true);
});

test("precheck: reasons are non-empty user-facing strings", () => {
  for (const bad of [undefined, "", "x".repeat(3000), "\u0000", "拉丁语"]) {
    const r = precheck(bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, "string");
    assert.ok(r.reason.length > 10);
  }
});
