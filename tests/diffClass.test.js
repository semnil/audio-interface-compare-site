// tests/diffClass.test.js
// Unit tests for the diffClass (highlight decision) logic of build.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { _diffClass as diffClass } from "../src/build.js";

describe("diffClass: higherBetter keys", () => {
  test("in a numeric comparison the larger one is highlighted (micPre)", () => {
    assert.deepEqual(diffClass("micPre", 4, 2), [" highlight", ""]);
  });

  test("in a numeric comparison the larger one is highlighted (sampleRate)", () => {
    assert.deepEqual(diffClass("sampleRate", 48, 192), ["", " highlight"]);
  });

  test("equal values highlight neither", () => {
    assert.deepEqual(diffClass("micPre", 2, 2), ["", ""]);
  });

  test("gainRange: comparison between numbers works normally", () => {
    assert.deepEqual(diffClass("gainRange", 65, 47), [" highlight", ""]);
  });

  // Range string support for gainRange (parseNumeric uses the mean of the range)
  test("gainRange: range string '0-65' (mean 32.5) vs 47 -> B is highlighted", () => {
    assert.deepEqual(diffClass("gainRange", "0-65", 47), ["", " highlight"]);
  });

  test("gainRange: range string '0-75' (mean 37.5) vs '0-65' (mean 32.5) -> A is highlighted", () => {
    assert.deepEqual(diffClass("gainRange", "0-75", "0-65"), [" highlight", ""]);
  });

  test("gainRange: equal range strings are a tie", () => {
    assert.deepEqual(diffClass("gainRange", "0-65", "0-65"), ["", ""]);
  });

  test("gainRange: negative value vs positive value", () => {
    assert.deepEqual(diffClass("gainRange", -18, 65), ["", " highlight"]);
  });

  test("gainRange: negative value vs null is not compared because one side is NaN", () => {
    assert.deepEqual(diffClass("gainRange", -18, null), ["", ""]);
  });

  test("gainRange: range with non-zero lower bound '10-65' (mean 37.5) vs '0-75' (mean 37.5) -> equal", () => {
    assert.deepEqual(diffClass("gainRange", "10-65", "0-75"), ["", ""]);
  });
});

describe("diffClass: THD+N / EIN are excluded from highlighting", () => {
  // THD+N / EIN have no fixed string format, so they are excluded from highlighting
  test("thdnMic is excluded from highlighting", () => {
    assert.deepEqual(
      diffClass("thdnMic", "-103.1dB (0.00070%)", "-92.0dB (0.0025%)"),
      ["", ""]
    );
  });

  test("thdnOut is excluded from highlighting", () => {
    assert.deepEqual(
      diffClass("thdnOut", "-88.0dB (0.0040%)", "-95.0dB (0.0018%)"),
      ["", ""]
    );
  });

  test("einA is excluded from highlighting", () => {
    assert.deepEqual(diffClass("einA", -130, -128), ["", ""]);
  });

  test("einUnknown is excluded from highlighting", () => {
    assert.deepEqual(diffClass("einUnknown", -125, -130), ["", ""]);
  });

  test("thdnUnknown is excluded from highlighting", () => {
    assert.deepEqual(diffClass("thdnUnknown", "-95.0dB (0.0018%)", "-88.0dB (0.0040%)"), ["", ""]);
  });
});

describe("diffClass: one side is null/undefined (missing values are not compared)", () => {
  test("A is null -> no highlight", () => {
    assert.deepEqual(diffClass("micPre", null, 2), ["", ""]);
  });

  test("B is null -> no highlight", () => {
    assert.deepEqual(diffClass("micPre", 4, null), ["", ""]);
  });

  test("A is undefined -> no highlight", () => {
    assert.deepEqual(diffClass("drIn", undefined, 120), ["", ""]);
  });

  test("both null: neither is highlighted", () => {
    assert.deepEqual(diffClass("micPre", null, null), ["", ""]);
  });

  test("both undefined: neither is highlighted", () => {
    assert.deepEqual(diffClass("drIn", undefined, undefined), ["", ""]);
  });

  test("one side is an empty string -> no highlight", () => {
    assert.deepEqual(diffClass("sampleRate", "", 192), ["", ""]);
  });
});

describe("diffClass: keys excluded from highlighting", () => {
  test("price is excluded from highlighting", () => {
    assert.deepEqual(diffClass("price", 100, 500), ["", ""]);
  });

  test("phantom is excluded from highlighting", () => {
    assert.deepEqual(diffClass("phantom", "Yes", "No"), ["", ""]);
  });

  test("os is excluded from highlighting", () => {
    assert.deepEqual(diffClass("os", "macOS/Windows", "macOS/Windows/iOS"), ["", ""]);
  });

  test("bundle is excluded from highlighting", () => {
    assert.deepEqual(diffClass("bundle", "Ableton Live Lite", "Pro Tools"), ["", ""]);
  });
});
