// tests/diffClass.test.js
// build.js の diffClass (ハイライト判定) ロジックのユニットテスト
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { _diffClass as diffClass } from "../src/build.js";

describe("diffClass: higherBetter 系", () => {
  test("数値比較で大きい方がハイライトされる (micPre)", () => {
    assert.deepEqual(diffClass("micPre", 4, 2), [" highlight", ""]);
  });

  test("数値比較で小さい方がハイライトされる (sampleRate)", () => {
    assert.deepEqual(diffClass("sampleRate", 48, 192), ["", " highlight"]);
  });

  test("同値はどちらもハイライトしない", () => {
    assert.deepEqual(diffClass("micPre", 2, 2), ["", ""]);
  });

  test("gainRange: 数値同士の比較は正常動作する", () => {
    assert.deepEqual(diffClass("gainRange", 65, 47), [" highlight", ""]);
  });

  // gainRange の範囲文字列対応 (parseNumeric で上限値を使用)
  test("gainRange: 範囲文字列 '0-65' vs 47 → 上限 65 > 47 で A がハイライト", () => {
    assert.deepEqual(diffClass("gainRange", "0-65", 47), [" highlight", ""]);
  });

  test("gainRange: 範囲文字列 '0-75' vs '0-65' → 上限 75 > 65 で A がハイライト", () => {
    assert.deepEqual(diffClass("gainRange", "0-75", "0-65"), [" highlight", ""]);
  });

  test("gainRange: 範囲文字列の同値は引き分け", () => {
    assert.deepEqual(diffClass("gainRange", "0-65", "0-65"), ["", ""]);
  });

  test("gainRange: 負値 vs 正値", () => {
    assert.deepEqual(diffClass("gainRange", -18, 65), ["", " highlight"]);
  });

  test("gainRange: 負値 vs null", () => {
    assert.deepEqual(diffClass("gainRange", -18, null), [" highlight", ""]);
  });

  test("gainRange: 非ゼロ下限範囲 '10-65' vs '0-75' → 上限比較", () => {
    assert.deepEqual(diffClass("gainRange", "10-65", "0-75"), ["", " highlight"]);
  });
});

describe("diffClass: THD+N / EIN はハイライト対象外", () => {
  // THD+N / EIN は文字列フォーマットが不定でハイライト対象外
  test("thdnMic はハイライト対象外", () => {
    assert.deepEqual(
      diffClass("thdnMic", "-103.1dB (0.00070%)", "-92.0dB (0.0025%)"),
      ["", ""]
    );
  });

  test("thdnOut はハイライト対象外", () => {
    assert.deepEqual(
      diffClass("thdnOut", "-88.0dB (0.0040%)", "-95.0dB (0.0018%)"),
      ["", ""]
    );
  });

  test("einA はハイライト対象外", () => {
    assert.deepEqual(diffClass("einA", -130, -128), ["", ""]);
  });

  test("einUnknown はハイライト対象外", () => {
    assert.deepEqual(diffClass("einUnknown", -125, -130), ["", ""]);
  });

  test("thdnUnknown はハイライト対象外", () => {
    assert.deepEqual(diffClass("thdnUnknown", "-95.0dB (0.0018%)", "-88.0dB (0.0040%)"), ["", ""]);
  });
});

describe("diffClass: 片側が null/undefined", () => {
  test("A が null → B がハイライト", () => {
    assert.deepEqual(diffClass("micPre", null, 2), ["", " highlight"]);
  });

  test("B が null → A がハイライト", () => {
    assert.deepEqual(diffClass("micPre", 4, null), [" highlight", ""]);
  });

  test("A が undefined → B がハイライト", () => {
    assert.deepEqual(diffClass("drIn", undefined, 120), ["", " highlight"]);
  });

  test("両方 null: どちらもハイライトしない", () => {
    assert.deepEqual(diffClass("micPre", null, null), ["", ""]);
  });

  test("両方 undefined: どちらもハイライトしない", () => {
    assert.deepEqual(diffClass("drIn", undefined, undefined), ["", ""]);
  });

  test("片側が空文字 → もう一方がハイライト", () => {
    assert.deepEqual(diffClass("sampleRate", "", 192), ["", " highlight"]);
  });
});

describe("diffClass: ハイライト対象外キー", () => {
  test("price はハイライト対象外", () => {
    assert.deepEqual(diffClass("price", 100, 500), ["", ""]);
  });

  test("phantom はハイライト対象外", () => {
    assert.deepEqual(diffClass("phantom", "Yes", "No"), ["", ""]);
  });

  test("os はハイライト対象外", () => {
    assert.deepEqual(diffClass("os", "macOS/Windows", "macOS/Windows/iOS"), ["", ""]);
  });

  test("bundle はハイライト対象外", () => {
    assert.deepEqual(diffClass("bundle", "Ableton Live Lite", "Pro Tools"), ["", ""]);
  });
});
