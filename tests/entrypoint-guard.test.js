// tests/entrypoint-guard.test.js
// Checks the entrypoint guard added by the L1 fix of build.js (src/build.js:1104)
// Confirms that build() does not run automatically when imported from tests,
// and states the known compatibility constraint on Windows.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD_SRC = join(ROOT, "src", "build.js");

describe("build.js: entrypoint guard", () => {
  test("a guard comparing import.meta.url with pathToFileURL(process.argv[1]).href exists", () => {
    const src = readFileSync(BUILD_SRC, "utf8");
    assert.ok(/import\.meta\.url\s*===\s*pathToFileURL\(\s*process\.argv\[1\]\s*\)\.href/.test(src),
      "the pathToFileURL-based entrypoint guard does not exist in src/build.js");
  });

  test("the build() call is inside the guard and does not appear at the top level", () => {
    const src = readFileSync(BUILD_SRC, "utf8");
    // A guard statement always exists before the build() call
    const buildCallIdx = src.indexOf("build();");
    assert.ok(buildCallIdx > 0, "build() call not found");
    // The guard statement is right before the build() call
    const snippetBefore = src.slice(Math.max(0, buildCallIdx - 200), buildCallIdx);
    assert.ok(/if\s*\([^)]*import\.meta\.url/.test(snippetBefore),
      `no guard statement right before the build() call: ${snippetBefore}`);
  });

  test("a dynamic import ({/* no-op */}) does not start build() and only obtains the exports", async () => {
    // Existing tests (diffClass.test.js) assume that the import can be done without side effects
    // If the side effect runs, the build takes more than 20 seconds, so this judges by whether the import finishes quickly
    const start = Date.now();
    const mod = await import(BUILD_SRC);
    const elapsed = Date.now() - start;
    // Confirm the import finishes within 1 second (reading the xlsx takes several seconds)
    assert.ok(elapsed < 1500, `import is slow at ${elapsed}ms -> build() may have run as a side effect`);
    // Check the exports
    assert.equal(typeof mod._slugify, "function");
    assert.equal(typeof mod._escapeHtml, "function");
    assert.equal(typeof mod._diffClass, "function");
    assert.ok(Array.isArray(mod.COLUMNS));
  });

  test("Windows compatibility: uses pathToFileURL to normalize a backslash-style argv[1]", () => {
    // Official Node.js idiom: url.pathToFileURL(process.argv[1]).href === import.meta.url
    // With the old implementation's `file://${process.argv[1]}` string concatenation, on Windows
    //   process.argv[1]: C:\\path\\to\\build.js
    //   `file://${...}`: file://C:\\path\\to\\build.js
    //   import.meta.url: file:///C:/path/to/build.js
    // did not match, so build() did not start even when run directly.
    // The current implementation converts it to a URL with pathToFileURL before comparing, so it works on Windows too.
    const src = readFileSync(BUILD_SRC, "utf8");
    assert.ok(/pathToFileURL/.test(src),
      "the guard does not use pathToFileURL (required for Windows compatibility)");
    // The old string concatenation `file://${process.argv[1]}` does not remain
    assert.equal(/`file:\/\/\$\{process\.argv\[1\]\}`/.test(src), false,
      "the old file:// string concatenation remains (misjudges on Windows)");
  });
});
