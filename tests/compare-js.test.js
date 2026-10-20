// tests/compare-js.test.js
// Checks for the client-side dynamic comparison (dist/compare.js) and the comparison view wiring of the index
// Skipped when dist/ is not built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { _diffClass, _renderMeasurements } from "../src/build.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COMPARE_JS = join(ROOT, "dist", "compare.js");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const distExists = existsSync(COMPARE_JS) && existsSync(INDEX_PATH);

describe("compare.js: client comparison renderer", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("is syntactically valid JS (parsable with new Function)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    // The IIFE body is not executed (new Function only creates the function and does not call it), so only the syntax is checked, without depending on the DOM
    assert.doesNotThrow(() => new Function(src), "compare.js has a syntax error");
  });

  test("the build.js helpers are embedded (sharing a single source of truth)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    for (const fn of ["function escapeHtml", "function sanitizeUrl", "function displayValue",
      "function renderMeasurements", "function parseNumeric", "function diffClass"]) {
      assert.ok(src.includes(fn), `${fn} is not embedded in compare.js`);
    }
  });

  test("contains the pieces for fragment routing, data fetching, and applying i18n", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    assert.ok(src.includes("products.json"), "no fetch of products.json");
    assert.ok(/location\.hash/.test(src), "no reference to location.hash");
    assert.ok(src.includes("hashchange"), "no hashchange listener");
    assert.ok(src.includes("__i18n"), "no use of window.__i18n");
  });

  test("slugs from the URL are resolved by map lookup, and unknown slugs show not-found (not echoed raw)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    // A slug is resolved by the map[slugA] lookup, and notFound is shown when it is not found
    assert.ok(/map\[slug[AB]\]/.test(src), "no map lookup of the slug");
    assert.ok(src.includes("notFound"), "no not-found handling");
  });

  test("loads and runs on a minimal DOM stub (detects missing free variables of the embedded functions by running them)", () => {
    // With .toString() embedding, when a build.js helper gains a new module-scope dependency,
    // the syntax stays valid but it becomes a ReferenceError at run time. Detected by actually running the load path (route -> showSelector)
    const src = readFileSync(COMPARE_JS, "utf8");
    const noop = () => {};
    const sandbox = {
      location: { hash: "", pathname: "/", search: "" },
      history: { pushState: noop },
      fetch: () => Promise.reject(new Error("not needed at load")),
      window: { addEventListener: noop, scrollTo: noop, __i18n: { isJa: false, apply: noop } },
      document: { addEventListener: noop, getElementById: () => null, documentElement: { lang: "en" }, title: "" },
      URLSearchParams,
    };
    assert.doesNotThrow(() => vm.runInNewContext(src, sandbox),
      "compare.js throws when loaded (a missing free variable or a broken DOM assumption)");
  });

  test("the embedded diffClass / renderMeasurements give the same output as the build.js implementation (equivalence of the single source of truth)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    // Cut out and evaluate the embedded block (from HIGHER_BETTER to just before withMark)
    const start = src.indexOf("var HIGHER_BETTER=");
    const end = src.indexOf("function withMark");
    assert.ok(start > 0 && end > start, "the boundaries of the embedded block not found");
    const embedded = new Function(`${src.slice(start, end)}; return { diffClass, renderMeasurements };`)();
    const diffCases = [
      ["micPre", 2, 4],
      ["micPre", "", 4],
      ["gainRange", "0 to +60", "-5 to +60"],
      ["price", 100, 200],
      ["drIn", "116", "120"],
    ];
    for (const [key, a, b] of diffCases) {
      assert.deepEqual(embedded.diffClass(key, a, b), _diffClass(key, a, b), `diffClass(${key}, ${a}, ${b}) does not match`);
    }
    const measureCases = [
      "[ASR](https://example.com/x) / [RMAA](http://example.org/y)",
      "[bad](javascript:alert(1))",
      "",
    ];
    for (const val of measureCases) {
      assert.equal(embedded.renderMeasurements(val), _renderMeasurements(val), `renderMeasurements(${JSON.stringify(val)}) does not match`);
    }
  });
});

describe("index.html: comparison view wiring", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the compare-view container and selector-view exist", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(html.includes('id="compare-view"'), "no compare-view container");
    assert.ok(html.includes('id="selector-view"'), "no selector-view wrapper");
  });

  test("loads compare.js", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<script src="[^"]*compare\.js"/.test(html), "no script tag for compare.js");
  });

  test("the compare button navigates to location.hash (fragment) (no navigation to a static page)", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/location\.hash\s*=\s*'#a='/.test(html), "the compare button does not set location.hash");
    assert.equal(/window\.location\.href\s*=\s*BASE_PATH\s*\+\s*'compare\//.test(html), false,
      "old: navigation code to the static compare page remains");
  });

  test("contains no static /compare/ URL at all", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.equal(html.includes("/compare/"), false, "a static /compare/ URL remains in index");
  });
});
