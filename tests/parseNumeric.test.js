// tests/parseNumeric.test.js
// build.js の parseNumeric / diffClass の範囲文字列解析の境界値検証
// src/build.js を import すると build() が走ってしまうため、
// 本ファイルでは parseNumeric / diffClass のロジックをインライン再定義する
// (diffClass.test.js は import 方式だが、本ファイルは境界値網羅に特化し副作用を避ける)
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js の parseNumeric と同一ロジック (範囲文字列は両端の平均を返す)
function parseNumeric(val) {
  const s = String(val).trim();
  const rangeMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*[-\u2013]\s*(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  return parseFloat(s);
}

// build.js の diffClass と同一ロジック (片側でも NaN なら比較しない)
function diffClass(key, valA, valB) {
  const higherBetter = ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn",
    "mainOut", "lineOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut",
    "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"];
  if (!higherBetter.includes(key)) return ["", ""];
  const nA = parseNumeric(valA), nB = parseNumeric(valB);
  if (isNaN(nA) || isNaN(nB)) return ["", ""];
  if (nA === nB) return ["", ""];
  return nA > nB ? [" highlight", ""] : ["", " highlight"];
}

describe("parseNumeric: 範囲文字列の境界値 (via diffClass:gainRange)", () => {
  test("範囲文字列 '0-65' は平均 32.5 として扱われる", () => {
    // 'A=0-65' (平均 32.5) vs 'B=50' → 50 > 32.5 で B ハイライト
    assert.deepEqual(diffClass("gainRange", "0-65", 50), ["", " highlight"]);
  });

  test("範囲文字列 '0-75' は平均 37.5 として扱われる", () => {
    assert.deepEqual(diffClass("gainRange", "0-75", 80), ["", " highlight"]);
  });

  test("半角ハイフン '-' で範囲認識される (U+002D)", () => {
    // '60-65' (平均 62.5) vs 30 → A ハイライト
    assert.deepEqual(diffClass("gainRange", "60-65", 30), [" highlight", ""]);
  });

  test("en-dash U+2013 で範囲認識される", () => {
    // '0\u201365' (平均 32.5) vs 50 → B ハイライト
    assert.deepEqual(diffClass("gainRange", "0\u201365", 50), ["", " highlight"]);
  });

  test("範囲文字列 + 空白混在でも認識される ('0 - 65')", () => {
    // '0 - 65' (平均 32.5) vs 50 → B ハイライト
    assert.deepEqual(diffClass("gainRange", "0 - 65", 50), ["", " highlight"]);
  });

  test("小数範囲 '0-66.5' は平均 33.25 として扱われる", () => {
    // '0-66.5' (平均 33.25) vs 66 → B ハイライト
    assert.deepEqual(diffClass("gainRange", "0-66.5", 66), ["", " highlight"]);
  });

  test("非ゼロ下限範囲 '10-65' は平均 37.5 として扱われる", () => {
    // '10-65' (平均 37.5) vs 30 → A ハイライト
    assert.deepEqual(diffClass("gainRange", "10-65", 30), [" highlight", ""]);
  });

  test("単独負値 '-18' は数値 -18 として扱われる", () => {
    assert.deepEqual(diffClass("gainRange", "-18", 0), ["", " highlight"]);
  });

  test("負値範囲 '-18-65' は平均 23.5 として扱われる", () => {
    // 'A=-18-65' (平均 23.5) vs 'B=50' → B ハイライト
    assert.deepEqual(diffClass("gainRange", "-18-65", 50), ["", " highlight"]);
  });

  test("空白のみ文字列は両側 NaN → 空配列", () => {
    assert.deepEqual(diffClass("gainRange", "   ", "   "), ["", ""]);
  });

  test("非数値文字列 'N/A' vs 数値 → 片側 NaN なので比較しない", () => {
    assert.deepEqual(diffClass("gainRange", "N/A", 65), ["", ""]);
  });
});

describe("diffClass: sampleRate/bitDepth 境界値", () => {
  test("sampleRate 44.1 vs 48 → 高い方 (B) がハイライト", () => {
    assert.deepEqual(diffClass("sampleRate", 44.1, 48), ["", " highlight"]);
  });

  test("sampleRate 192 vs 384 → 高い方 (B) がハイライト", () => {
    assert.deepEqual(diffClass("sampleRate", 192, 384), ["", " highlight"]);
  });

  test("bitDepth 16 vs 24 → B ハイライト", () => {
    assert.deepEqual(diffClass("bitDepth", 16, 24), ["", " highlight"]);
  });

  test("bitDepth 24 vs 32 → B ハイライト", () => {
    assert.deepEqual(diffClass("bitDepth", 24, 32), ["", " highlight"]);
  });
});

describe("diffClass: ゼロ値の扱い (isNaN vs falsy)", () => {
  test("micPre 0 vs 2 → B ハイライト", () => {
    assert.deepEqual(diffClass("micPre", 0, 2), ["", " highlight"]);
  });

  test("micPre 0 vs 0 → 両方ゼロで引き分け", () => {
    assert.deepEqual(diffClass("micPre", 0, 0), ["", ""]);
  });

  test("micPre 0 vs null → 片側 NaN なので比較しない", () => {
    // 欠損 (null) を「劣位」と誤認しないよう片側 NaN はハイライト抑止
    assert.deepEqual(diffClass("micPre", 0, null), ["", ""]);
  });
});
