// tests/safeJsonForScript.test.js
// Contract tests for build.js safeJsonForScript (src/build.js:149-154)
// Guards against script escape / U+2028/U+2029 when embedding JSON in an inline script
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as build.js:149-154
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

describe("safeJsonForScript: round trip of ordinary values", () => {
  test("an ordinary alphanumeric object can be passed to JSON.parse", () => {
    const input = { name: "Focusrite Scarlett 2i2", price: 200 };
    const encoded = safeJsonForScript(input);
    assert.deepEqual(JSON.parse(encoded), input);
  });

  test("Japanese strings pass through unchanged", () => {
    const input = { name: "日本語のブランド" };
    const encoded = safeJsonForScript(input);
    assert.deepEqual(JSON.parse(encoded), input);
  });

  test("arrays and nested objects are serialized correctly", () => {
    const input = [{ a: [1, 2, 3] }, { b: { c: "x" } }];
    assert.deepEqual(JSON.parse(safeJsonForScript(input)), input);
  });
});

describe("safeJsonForScript: <script> escape defense", () => {
  test("</script> is converted to \\u003c/script", () => {
    const input = { x: "</script>" };
    const out = safeJsonForScript(input);
    assert.equal(/<\/script/i.test(out), false,
      `a raw </script> remains: ${out}`);
    assert.ok(out.includes("\\u003c"), "\\u003c is not included");
  });

  test("every raw < character becomes \\u003c", () => {
    const input = { x: "<img>", y: "<div>" };
    const out = safeJsonForScript(input);
    assert.equal(/</.test(out), false, "a raw < remains");
  });

  test("uppercase </SCRIPT> is converted as well", () => {
    const input = { x: "</SCRIPT>" };
    const out = safeJsonForScript(input);
    assert.equal(/<\/SCRIPT/i.test(out), false);
  });

  test("the object after JSON.parse restores the original value (round trip)", () => {
    const input = { x: "</script><script>alert(1)</script>" };
    const encoded = safeJsonForScript(input);
    const decoded = JSON.parse(encoded);
    assert.equal(decoded.x, input.x);
  });
});

describe("safeJsonForScript: U+2028/U+2029 defense", () => {
  test("U+2028 (LINE SEPARATOR) is escaped to \\u2028", () => {
    const input = { x: "a\u2028b" };
    const out = safeJsonForScript(input);
    assert.equal(/\u2028/.test(out), false,
      "a raw U+2028 remains (a JS parser may interpret it as a line break)");
    assert.ok(out.includes("\\u2028"));
  });

  test("U+2029 (PARAGRAPH SEPARATOR) is escaped to \\u2029", () => {
    const input = { x: "a\u2029b" };
    const out = safeJsonForScript(input);
    assert.equal(/\u2029/.test(out), false);
    assert.ok(out.includes("\\u2029"));
  });

  test("round trip of a string containing U+2028/U+2029", () => {
    const input = { x: "a\u2028\u2029b" };
    const decoded = JSON.parse(safeJsonForScript(input));
    assert.equal(decoded.x, input.x);
  });
});

describe("safeJsonForScript: coverage of the escape order", () => {
  // JSON.stringify turns " -> \" and \ -> \\, but passes < and U+2028/2029 through
  // so a later stage has to replace them in the string

  test("all dangerous characters are escaped even when mixed together", () => {
    const input = { a: "</script>", b: "x\u2028y", c: "z\u2029w" };
    const out = safeJsonForScript(input);
    assert.equal(/<\/script/i.test(out), false);
    assert.equal(/\u2028/.test(out), false);
    assert.equal(/\u2029/.test(out), false);
  });

  test("empty object / empty array are handled without problems", () => {
    assert.equal(safeJsonForScript({}), "{}");
    assert.equal(safeJsonForScript([]), "[]");
  });

  test("null / numbers / booleans are serialized to JSON as is", () => {
    assert.equal(safeJsonForScript(null), "null");
    assert.equal(safeJsonForScript(42), "42");
    assert.equal(safeJsonForScript(true), "true");
  });
});

describe("safeJsonForScript: real-use scenario inside an inline script", () => {
  test("no escape occurs with the <script>const PRODUCTS = {JSON};</script> pattern", () => {
    // Reproduces the inline expansion pattern of build.js:767-768
    const products = [
      { slug: "x", brand: "</script><script>alert(1)</script>", model: "y" },
    ];
    const encoded = safeJsonForScript(products);
    const inlineHtml = `<script>const PRODUCTS = ${encoded};</script>`;

    // Whether an extra <script> / </script> appears between the leading <script> and the trailing </script>
    const scriptOpens = (inlineHtml.match(/<script>/g) || []).length;
    const scriptCloses = (inlineHtml.match(/<\/script>/g) || []).length;
    assert.equal(scriptOpens, 1, `${scriptOpens} <script> open tags (expected: 1)`);
    assert.equal(scriptCloses, 1, `${scriptCloses} </script> close tags (expected: 1)`);
  });
});
