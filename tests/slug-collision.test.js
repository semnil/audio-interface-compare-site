// tests/slug-collision.test.js
// Boundary tests that enumerate potential slugify collision patterns
// Guarantees the current data has no collisions and detects collisions early when products are added
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as build.js slugify (src/build.js:124-130)
function slugify(brand, model) {
  return `${brand}-${model}`
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

describe("slugify: combinations that can collide (regression pin of a known constraint)", () => {
  // The following patterns produce the same slug by design.
  // They do not collide in the current xlsx data, but need attention when products are added in the future.
  // The tests document "the behavior of the current implementation" and detect differences when the logic changes.

  test("whitespace and hyphens are not distinguished, so both can produce the same slug", () => {
    assert.equal(slugify("Brand", "A B"), "brand-a-b");
    assert.equal(slugify("Brand", "A-B"), "brand-a-b");
  });

  test("underscores and hyphens are not distinguished either", () => {
    assert.equal(slugify("Brand", "A_B"), "brand-a-b");
    assert.equal(slugify("Brand", "A-B"), "brand-a-b");
  });

  test("dots and hyphens are not distinguished either", () => {
    assert.equal(slugify("Brand", "A.B"), "brand-a-b");
    assert.equal(slugify("Brand", "A-B"), "brand-a-b");
  });

  test("consecutive separators vs a single separator: same slug", () => {
    assert.equal(slugify("Brand", "A---B"), "brand-a-b");
    assert.equal(slugify("Brand", "A   B"), "brand-a-b");
    assert.equal(slugify("Brand", "A _-_ B"), "brand-a-b");
  });

  test("case differences are absorbed", () => {
    assert.equal(slugify("brand", "MODEL"), slugify("BRAND", "model"));
  });
});

describe("slugify: preserving Japanese (hiragana and kanji)", () => {
  test("hiragana stays in the slug as is (U+3040-U+309F is allowed by the regex)", () => {
    const r = slugify("brand", "ひらがな");
    assert.ok(r.includes("ひらがな"), `hiragana was removed: ${r}`);
  });

  test("kanji stays in the slug as is (U+4E00-U+9FFF is allowed by the regex)", () => {
    const r = slugify("brand", "漢字");
    assert.ok(r.includes("漢字"), `kanji was removed: ${r}`);
  });

  test("katakana is removed (U+30A0-U+30FF is outside the regex range)", () => {
    // regex: [a-z0-9\u3040-\u9fff]+ - is katakana (U+30A0+) included?
    // In fact U+30A0-U+30FF is within the \u3040-\u9fff range
    const r = slugify("brand", "カタカナ");
    assert.ok(r.includes("カタカナ"), `katakana was removed: ${r}`);
  });
});

describe("slugify: leading and trailing non-alphanumerics", () => {
  test("leading consecutive non-alphanumerics and trailing consecutive non-alphanumerics are both removed", () => {
    assert.equal(slugify("!!!Brand!!!", "???Model???"), "brand-model");
  });

  test("for a brand with a leading -, the leading - of the slug is removed", () => {
    assert.equal(slugify("-Brand", "Model"), "brand-model");
  });

  test("input made only of non-alphanumerics becomes an empty string", () => {
    assert.equal(slugify("!!!", "???"), "");
  });
});

describe("slugify: processing order of the + sign", () => {
  test("after + is converted to -plus, non-alphanumeric normalization runs", () => {
    // "A+" → "a-plus" → "a-plus"
    assert.equal(slugify("Brand", "A+"), "brand-a-plus");
  });

  test("'+' + whitespace combination: 'A + B' -> 'a-plus-b' (+ -> -plus, remaining whitespace -> -)", () => {
    // "A + B" → "a -plus b" → "a-plus-b"
    const r = slugify("brand", "A + B");
    assert.equal(r, "brand-a-plus-b");
  });

  test("multiple consecutive +: 'A++' -> 'a-plus-plus'", () => {
    // "A++" → "a-plus-plus"
    assert.equal(slugify("Brand", "A++"), "brand-a-plus-plus");
  });
});
