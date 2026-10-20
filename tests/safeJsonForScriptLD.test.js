// tests/safeJsonForScriptLD.test.js
// Contract tests for build.js safeJsonForScriptLD (src/build.js:157-159)
// In addition to the ordinary safeJsonForScript, it also escapes & -> \u0026
// Inside JSON-LD (application/ld+json), a raw & also helps a <script> escape because of how HTML is parsed
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Reproduces the same logic as src/build.js (redefined inline to avoid import side effects)
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
function safeJsonForScriptLD(obj) {
  return safeJsonForScript(obj).replace(/&/g, "\\u0026");
}

describe("safeJsonForScriptLD: escapes & to \\u0026 (difference from safeJsonForScript)", () => {
  test("brand name 'Allen & Heath' is converted to a string containing \\u0026", () => {
    const input = { name: "Allen & Heath" };
    const out = safeJsonForScriptLD(input);
    assert.ok(out.includes("Allen \\u0026 Heath"),
      `does not contain Allen \\u0026 Heath: ${out}`);
    // No raw & appears
    assert.equal(/&/.test(out), false, `a raw & remains: ${out}`);
  });

  test("the object after JSON.parse restores the original & (round trip)", () => {
    const input = { name: "A & B", url: "https://a.com?x=1&y=2" };
    const encoded = safeJsonForScriptLD(input);
    const decoded = JSON.parse(encoded);
    assert.deepEqual(decoded, input);
  });

  test("< / U+2028 / U+2029 / & are all escaped at the same time", () => {
    const input = { x: "</script>", y: "a\u2028b", z: "c\u2029d", amp: "A & B" };
    const out = safeJsonForScriptLD(input);
    assert.equal(/</.test(out), false, "< remains");
    assert.equal(/[\u2028\u2029]/.test(out), false, "U+2028/U+2029 remains");
    assert.equal(/&/.test(out), false, "& remains");
    // Round trip check
    assert.deepEqual(JSON.parse(out), input);
  });

  test("for input without &, the output is identical to safeJsonForScript", () => {
    const input = { name: "Focusrite Scarlett" };
    assert.equal(safeJsonForScriptLD(input), safeJsonForScript(input));
  });
});

describe("safeJsonForScriptLD: consistency when embedded as JSON-LD in <script type=\"application/ld+json\">", () => {
  test("no <script> tag escape occurs even when brand has a value containing &", () => {
    const obj = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Allen & Heath CQ-12T vs Allen & Heath CQ-18T",
      about: [
        { "@type": "Product", name: "Allen & Heath CQ-12T" },
        { "@type": "Product", name: "Allen & Heath CQ-18T" },
      ],
    };
    const ld = safeJsonForScriptLD(obj);
    const embedded = `<script type="application/ld+json">${ld}</script>`;
    // Only one <script> tag pair
    const opens = (embedded.match(/<script/gi) || []).length;
    const closes = (embedded.match(/<\/script/gi) || []).length;
    assert.equal(opens, 1, `<script> open tags: ${opens}`);
    assert.equal(closes, 1, `</script> close tags: ${closes}`);
    // Extract and parse the body (the actual JSON, excluding the type attribute)
    const body = embedded.match(/<script[^>]+>([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(body), obj);
  });

  test("combination of '</script>' and & in name: escaping both defends against the escape", () => {
    const obj = { name: "Evil & </script><script>alert(1)</script>" };
    const ld = safeJsonForScriptLD(obj);
    assert.equal(/<\/script/i.test(ld), false, `</script remains: ${ld}`);
    assert.equal(/&/.test(ld), false, `& remains: ${ld}`);
    const embedded = `<script type="application/ld+json">${ld}</script>`;
    const opens = (embedded.match(/<script/gi) || []).length;
    const closes = (embedded.match(/<\/script/gi) || []).length;
    assert.equal(opens, 1);
    assert.equal(closes, 1);
  });
});

describe("safeJsonForScriptLD vs safeJsonForScript: separation contract by design", () => {
  // The PRODUCTS inline is an ordinary <script>, so & needs no escaping (& is fine for JSON.parse)
  // JSON-LD is application/ld+json but still inside a <script> tag;
  //   the HTML parser treats <script> content as CDATA, so a raw & is fine in principle.
  //   However, to avoid the risk of misbehavior in some parser implementations or minifiers,
  //   only the & in JSON-LD is converted to \u0026 as defense in depth.
  test("the PRODUCTS inline keeps & (safeJsonForScript side)", () => {
    const input = { brand: "Allen & Heath" };
    const out = safeJsonForScript(input);
    assert.ok(out.includes("&"), "by design the PRODUCTS side keeps &");
    assert.equal(out.includes("\\u0026"), false);
  });

  test("JSON-LD turns & into \\u0026 (safeJsonForScriptLD side)", () => {
    const input = { brand: "Allen & Heath" };
    const out = safeJsonForScriptLD(input);
    assert.equal(out.includes("&"), false, "by design the JSON-LD side does not keep &");
    assert.ok(out.includes("\\u0026"));
  });
});
