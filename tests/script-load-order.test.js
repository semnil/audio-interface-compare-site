// tests/script-load-order.test.js
// Checks the script load order of PAGE_JA (language resource) and i18n.js (translation logic)
// If the order is reversed, PAGE_JA is undefined when i18n.js runs and Japanese localization does not take effect
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const INDEX_PATH = join(DIST, "index.html");
const PRODUCTS_DIR = join(DIST, "products");
const distExists = existsSync(INDEX_PATH) && existsSync(PRODUCTS_DIR);

function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("script load order: PAGE_JA -> i18n.js", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("in index.html the PAGE_JA declaration comes before the i18n.js script tag", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const pageJaIdx = html.indexOf("var PAGE_JA=");
    const i18nIdx = html.indexOf("i18n.js");
    assert.ok(pageJaIdx > 0, "PAGE_JA declaration not found");
    assert.ok(i18nIdx > 0, "i18n.js reference not found");
    assert.ok(pageJaIdx < i18nIdx,
      `PAGE_JA (${pageJaIdx}) comes after i18n.js (${i18nIdx}) - load order bug`);
  });

  test("in index.html i18n.js comes before compare.js (compare.js uses window.__i18n)", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    // Judge by the position of script tags with a src attribute (avoids a false match on "compare.js" in comments)
    const i18nIdx = html.search(/<script src="[^"]*i18n\.js"/);
    const compareIdx = html.search(/<script src="[^"]*compare\.js"/);
    assert.ok(i18nIdx > 0, "i18n.js script tag not found");
    assert.ok(compareIdx > 0, "compare.js script tag not found");
    assert.ok(i18nIdx < compareIdx,
      `i18n.js (${i18nIdx}) comes after compare.js (${compareIdx}) - window.__i18n undefined bug`);
  });

  test("PAGE_JA comes before i18n.js on 10 product pages", () => {
    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 10);
    const violations = [];
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const pageJaIdx = html.indexOf("var PAGE_JA=");
      const i18nIdx = html.indexOf("i18n.js");
      if (pageJaIdx < 0 || i18nIdx < 0 || pageJaIdx >= i18nIdx) {
        violations.push(`${d}: PAGE_JA=${pageJaIdx}, i18n.js=${i18nIdx}`);
      }
    }
    assert.equal(violations.length, 0,
      `load order violations: ${violations.slice(0, 3).join(" / ")}`);
  });
});

describe("PAGE_JA JS syntax soundness", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("PAGE_JA in index.html parses as JS", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/var PAGE_JA=(\{[^}]+\})/);
    assert.ok(m, "PAGE_JA declaration not found");
    const pageJaLiteral = m[1];
    // Evaluate with new Function. A SyntaxError means it is broken
    let parsed;
    assert.doesNotThrow(() => {
      parsed = new Function(`return ${pageJaLiteral};`)();
    }, `PAGE_JA does not parse as JS: ${pageJaLiteral.slice(0, 120)}`);
    // Minimal check that keys exist
    assert.ok(parsed.subtitle, "PAGE_JA.subtitle is missing");
    assert.ok(parsed.compareBtn, "PAGE_JA.compareBtn is missing");
    assert.ok(parsed.footer, "PAGE_JA.footer is missing");
  });

  test("PAGE_JA on product pages also parses as JS", () => {
    const dirs = sampleDirs(readdirSync(PRODUCTS_DIR), 5);
    for (const d of dirs) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const m = html.match(/var PAGE_JA=(\{[^}]+\})/);
      assert.ok(m, `${d}: PAGE_JA declaration not found`);
      assert.doesNotThrow(() => {
        new Function(`return ${m[1]};`)();
      }, `${d}: PAGE_JA parse failed`);
    }
  });
});
