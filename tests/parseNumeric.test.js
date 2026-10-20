// tests/parseNumeric.test.js
// Boundary tests for range-string parsing in build.js parseNumeric / diffClass
// Importing src/build.js would run build(), so
// this file redefines the parseNumeric / diffClass logic inline
// (diffClass.test.js uses import, but this file focuses on boundary coverage and avoids side effects)
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as build.js parseNumeric (a range string returns the mean of both ends)
function parseNumeric(val) {
  const s = String(val).trim();
  const rangeMatch = s.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:[-\u2013]|to\s)\s*([+-]?\d+(?:\.\d+)?)$/i);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  return parseFloat(s);
}

// Same logic as build.js diffClass (no comparison if either side is NaN)
function diffClass(key, valA, valB) {
  const higherBetter = ["micPre", "comboIn", "lineIn", "rcaIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn",
    "mainOut", "lineOut", "rcaOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut",
    "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"];
  if (!higherBetter.includes(key)) return ["", ""];
  const nA = parseNumeric(valA), nB = parseNumeric(valB);
  if (isNaN(nA) || isNaN(nB)) return ["", ""];
  if (nA === nB) return ["", ""];
  return nA > nB ? [" highlight", ""] : ["", " highlight"];
}

describe("parseNumeric: range string boundaries (via diffClass:gainRange)", () => {
  test("range string '0-65' is treated as its mean 32.5", () => {
    // 'A=0-65' (mean 32.5) vs 'B=50' -> 50 > 32.5, so B is highlighted
    assert.deepEqual(diffClass("gainRange", "0-65", 50), ["", " highlight"]);
  });

  test("range string '0-75' is treated as its mean 37.5", () => {
    assert.deepEqual(diffClass("gainRange", "0-75", 80), ["", " highlight"]);
  });

  test("ASCII hyphen '-' is recognized as a range (U+002D)", () => {
    // '60-65' (mean 62.5) vs 30 -> A highlighted
    assert.deepEqual(diffClass("gainRange", "60-65", 30), [" highlight", ""]);
  });

  test("en-dash U+2013 is recognized as a range", () => {
    // '0\u201365' (mean 32.5) vs 50 -> B highlighted
    assert.deepEqual(diffClass("gainRange", "0\u201365", 50), ["", " highlight"]);
  });

  test("range string with surrounding spaces is recognized ('0 - 65')", () => {
    // '0 - 65' (mean 32.5) vs 50 -> B highlighted
    assert.deepEqual(diffClass("gainRange", "0 - 65", 50), ["", " highlight"]);
  });

  test("decimal range '0-66.5' is treated as its mean 33.25", () => {
    // '0-66.5' (mean 33.25) vs 66 -> B highlighted
    assert.deepEqual(diffClass("gainRange", "0-66.5", 66), ["", " highlight"]);
  });

  test("range with non-zero lower bound '10-65' is treated as its mean 37.5", () => {
    // '10-65' (mean 37.5) vs 30 -> A highlighted
    assert.deepEqual(diffClass("gainRange", "10-65", 30), [" highlight", ""]);
  });

  test("standalone negative value '-18' is treated as the number -18", () => {
    assert.deepEqual(diffClass("gainRange", "-18", 0), ["", " highlight"]);
  });

  test("negative range '-18-65' is treated as its mean 23.5", () => {
    // 'A=-18-65' (mean 23.5) vs 'B=50' -> B highlighted
    assert.deepEqual(diffClass("gainRange", "-18-65", 50), ["", " highlight"]);
  });

  test("canonical form '-18 to +70' is treated as its mean 26", () => {
    // 'A=-18 to +70' (mean 26) vs 'B=50' -> B highlighted
    assert.deepEqual(diffClass("gainRange", "-18 to +70", 50), ["", " highlight"]);
  });

  test("canonical form '+10 to +65' is treated as its mean 37.5", () => {
    // '+10 to +65' (mean 37.5) vs 30 -> A highlighted
    assert.deepEqual(diffClass("gainRange", "+10 to +65", 30), [" highlight", ""]);
  });

  test("canonical form '0 to +60' is treated as its mean 30", () => {
    // '0 to +60' (mean 30) vs 50 -> B highlighted
    assert.deepEqual(diffClass("gainRange", "0 to +60", 50), ["", " highlight"]);
  });

  test("mixed-case 'to' in '0 To +60' is also recognized", () => {
    assert.deepEqual(diffClass("gainRange", "0 To +60", 50), ["", " highlight"]);
  });

  test("whitespace-only strings are NaN on both sides -> empty array", () => {
    assert.deepEqual(diffClass("gainRange", "   ", "   "), ["", ""]);
  });

  test("non-numeric string 'N/A' vs number -> one side is NaN, so no comparison", () => {
    assert.deepEqual(diffClass("gainRange", "N/A", 65), ["", ""]);
  });
});

describe("diffClass: sampleRate/bitDepth boundaries", () => {
  test("sampleRate 44.1 vs 48 -> the higher one (B) is highlighted", () => {
    assert.deepEqual(diffClass("sampleRate", 44.1, 48), ["", " highlight"]);
  });

  test("sampleRate 192 vs 384 -> the higher one (B) is highlighted", () => {
    assert.deepEqual(diffClass("sampleRate", 192, 384), ["", " highlight"]);
  });

  test("bitDepth 16 vs 24 -> B highlighted", () => {
    assert.deepEqual(diffClass("bitDepth", 16, 24), ["", " highlight"]);
  });

  test("bitDepth 24 vs 32 -> B highlighted", () => {
    assert.deepEqual(diffClass("bitDepth", 24, 32), ["", " highlight"]);
  });
});

describe("diffClass: handling of zero values (isNaN vs falsy)", () => {
  test("micPre 0 vs 2 -> B highlighted", () => {
    assert.deepEqual(diffClass("micPre", 0, 2), ["", " highlight"]);
  });

  test("micPre 0 vs 0 -> both zero, a tie", () => {
    assert.deepEqual(diffClass("micPre", 0, 0), ["", ""]);
  });

  test("micPre 0 vs null -> one side is NaN, so no comparison", () => {
    // Suppress highlighting when one side is NaN so a missing value (null) is not mistaken for the inferior one
    assert.deepEqual(diffClass("micPre", 0, null), ["", ""]);
  });
});
