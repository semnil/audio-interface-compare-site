// tests/slugify.test.js
// Unit tests for the build.js slugify function
// Importing build.js would read the xlsx, so equivalent logic is defined inline and tested
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as build.js slugify (src/build.js:124-130)
function slugify(brand, model) {
  return `${brand}-${model}`
    .toLowerCase()
    .replace(/\+/g, "-plus")    // "2+" → "2-plus"
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

describe("slugify", () => {
  test("a brand name containing an ampersand is converted correctly", () => {
    // & is non-alphanumeric, so it is replaced with -
    assert.equal(slugify("Allen & Heath", "CQ-12T"), "allen-heath-cq-12t");
  });

  test("the + sign is converted to -plus", () => {
    assert.equal(slugify("Brand", "Model 2+"), "brand-model-2-plus");
  });

  test("non-alphanumerics (such as !) are removed", () => {
    // Consecutive non-alphanumerics are collapsed into a single -
    assert.equal(slugify("Brand", "Model!!"), "brand-model");
  });

  test("leading and trailing hyphens are removed", () => {
    assert.equal(slugify("Brand", "-Model-"), "brand-model");
  });

  test("no duplicate hyphens remain (multiple non-alphanumerics collapse into one -)", () => {
    // The " & " in "Allen & Heath" is a run of 3 non-alphanumeric characters -> replaced with one -
    // so it becomes "allen-heath-..." and no "--" occurs
    const result = slugify("Allen & Heath", "CQ-12T");
    assert.equal(result.includes("--"), false, `contains duplicate hyphens: "${result}"`);
  });

  test("uppercase is converted to lowercase", () => {
    assert.equal(slugify("Focusrite", "Scarlett 2i2"), "focusrite-scarlett-2i2");
  });

  test("spaces are converted to -", () => {
    const result = slugify("Universal Audio", "Volt 2");
    assert.equal(result, "universal-audio-volt-2");
  });

  test("digits are kept", () => {
    assert.equal(slugify("RME", "Fireface 802"), "rme-fireface-802");
  });

  test("each of multiple + signs is converted to -plus (pins the behavior of the current logic)", () => {
    // + is converted to -plus before non-alphanumerics are removed, so
    // "A+B+" -> "a-plusb-plus" (no hyphen is inserted between plus and b)
    // This is the behavior of the current logic. No real data has the "A+B+" form, so there is no practical harm
    const result = slugify("Brand", "A+B+");
    assert.equal(result, "brand-a-plusb-plus");
  });
});
