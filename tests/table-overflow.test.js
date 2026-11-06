// tests/table-overflow.test.js
// The table wrapper is the containing block of the absolutely positioned .sr-only text inside the table,
// so that text scrolls with the table and does not widen the page
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "style.css");

describe("spec table wrapper", { skip: existsSync(CSS_PATH) ? false : "dist/ not built" }, () => {
  test("is positioned and clips or scrolls its overflow", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const rule = css.match(/\.spec-table-wrap \{([^}]*)\}/);
    assert.ok(rule, "no .spec-table-wrap rule");
    assert.ok(/position:\s*relative/.test(rule[1]), "the wrapper is not positioned");
    assert.ok(/overflow:\s*hidden/.test(rule[1]), "the wrapper does not contain its overflow");
    assert.ok(/\.sr-only \{[^}]*position:\s*absolute/.test(css), "the case this guards is gone: .sr-only is no longer absolute");
  });
});
