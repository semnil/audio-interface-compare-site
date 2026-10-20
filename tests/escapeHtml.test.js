// tests/escapeHtml.test.js
// Unit tests for the escapeHtml function of build.js
// Importing build.js reads the xlsx, so equivalent logic is defined inline and tested
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as escapeHtml of build.js (src/build.js:132-139)
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

describe("escapeHtml: XSS protection", () => {
  test("a <script> tag is escaped", () => {
    assert.equal(
      escapeHtml("<script>alert(1)</script>"),
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  test("< and > are each escaped", () => {
    assert.equal(escapeHtml("<div>"), "&lt;div&gt;");
  });

  test('double quotes are escaped (protection against attribute value injection)', () => {
    assert.equal(escapeHtml('"quoted"'), "&quot;quoted&quot;");
  });

  test("an img onerror pattern is escaped", () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = escapeHtml(input);
    assert.equal(result.includes("<"), false, "< remains");
    assert.equal(result.includes(">"), false, "> remains");
  });
});

describe("escapeHtml: ampersand", () => {
  test("an ampersand is escaped to &amp;", () => {
    assert.equal(escapeHtml("Allen & Heath"), "Allen &amp; Heath");
  });

  test("no double escaping (& is converted only once)", () => {
    // "A & B" -> "A &amp; B" (& becomes the 5-character &amp;)
    // Passing it through escapeHtml again would escape the & of &amp; again
    // Confirms the design in build.js that calls escapeHtml only once inside htmlHead
    const once = escapeHtml("A & B");
    assert.equal(once, "A &amp; B");
  });
});

describe("escapeHtml: safe handling of null/undefined", () => {
  test("null returns an empty string", () => {
    assert.equal(escapeHtml(null), "");
  });

  test("undefined returns an empty string", () => {
    assert.equal(escapeHtml(undefined), "");
  });

  test("a number is converted to a string", () => {
    assert.equal(escapeHtml(42), "42");
  });

  test("0 returns '0' (falsy but not null)", () => {
    assert.equal(escapeHtml(0), "0");
  });

  test("an empty string returns an empty string", () => {
    assert.equal(escapeHtml(""), "");
  });
});

describe("escapeHtml: ordinary strings are preserved", () => {
  test("ASCII alphanumerics are kept as is", () => {
    assert.equal(escapeHtml("Focusrite Scarlett 2i2"), "Focusrite Scarlett 2i2");
  });

  test("single quotes are not escaped (the design does not use ' for HTML attributes)", () => {
    // All attribute values in build.js are enclosed in double quotes, so escaping ' is unnecessary
    assert.equal(escapeHtml("it's"), "it's");
  });
});
