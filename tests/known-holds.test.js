// tests/known-holds.test.js
// Known holds (work/known-holds.json): a hold covers a discrepancy of its Brand + Model + column, and a hold that carries
// the cell value it was confirmed with covers it only while the cell still holds that value. Checks knownHoldMatcher in
// tools/verify/lib.js and runs copies of export-contested.js and build-report.js on a fixture where the cell changed
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { knownHoldMatcher } from "../tools/verify/lib.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("knownHoldMatcher", () => {
  const row = { Brand: "Alpha", Model: "One", "Line Inputs": "6", Notes: "n" };
  test("a hold without a value covers its Brand + Model + column whatever the cell holds", () => {
    const isHeld = knownHoldMatcher([{ brand: "Alpha", model: "One", column: "Line Inputs", note: "manual" }]);
    assert.equal(isHeld(row, "Line Inputs"), true);
    assert.equal(isHeld(row, "Notes"), false);
    assert.equal(isHeld({ ...row, Model: "Two" }, "Line Inputs"), false);
  });
  test("a hold with a value covers the column only while the cell holds that value", () => {
    assert.equal(knownHoldMatcher([{ brand: "Alpha", model: "One", column: "Line Inputs", value: "6" }])(row, "Line Inputs"), true);
    assert.equal(knownHoldMatcher([{ brand: "Alpha", model: "One", column: "Line Inputs", value: "2" }])(row, "Line Inputs"), false);
    assert.equal(knownHoldMatcher([{ brand: "Alpha", model: "One", column: "Hi-Z Inputs", value: "" }])(row, "Hi-Z Inputs"), true);
  });
});

describe("export-contested and build-report: a hold confirmed for an older value stops covering the discrepancy", () => {
  let base;
  const run = (holdValue) => {
    const work = join(base, "tools", "verify", "work");
    writeFileSync(join(work, "known-holds.json"), JSON.stringify([{ brand: "Alpha", model: "One", column: "Line Inputs", value: holdValue, note: "auto" }]));
    execFileSync(process.execPath, [join(base, "tools", "verify", "export-contested.js")], { cwd: base, encoding: "utf8" });
    const report = join(base, `report-${holdValue}.md`);
    execFileSync(process.execPath, [join(base, "tools", "verify", "build-report.js"), report], { cwd: base, encoding: "utf8" });
    return { contested: JSON.parse(readFileSync(join(work, "contested-index.json"), "utf8")), report: readFileSync(report, "utf8") };
  };

  before(() => {
    // Under the repository's ignored work/ directory, like the other tests that run copies of tools/verify
    mkdirSync(join(ROOT, "work"), { recursive: true });
    base = mkdtempSync(join(ROOT, "work", "test-known-holds-"));
    const verifyDir = join(base, "tools", "verify");
    const work = join(verifyDir, "work");
    mkdirSync(join(work, "results"), { recursive: true });
    for (const f of ["export-contested.js", "build-report.js", "lib.js"]) copyFileSync(join(ROOT, "tools", "verify", f), join(verifyDir, f));
    // The cell now holds 6; the official page says 2
    writeFileSync(join(work, "rows-full.json"), JSON.stringify([{ Brand: "Alpha", Model: "One", "Line Inputs": "6" }]));
    writeFileSync(join(work, "results", "product-000.json"), JSON.stringify({
      brand: "Alpha", model: "One", fetch_status: "ok", attempts: ["WebFetch"], sources: ["https://example.com/one"],
      mismatches: [{ column: "Line Inputs", xlsx_value: "6", page_value: "2", confidence: "high", evidence: "2 line inputs" }],
      not_stated: [], missing_in_xlsx: [], notes: "",
    }));
  });
  after(() => { if (base) rmSync(base, { recursive: true, force: true }); });

  test("a hold confirmed when the cell held 2 does not hide the discrepancy of 6", () => {
    const { contested, report } = run("2");
    assert.deepEqual(contested, [0]);
    assert.ok(!/items matching known holds/.test(report), "the report counted the discrepancy as a known hold");
  });

  test("a hold confirmed for the current value 6 still hides it", () => {
    const { contested, report } = run("6");
    assert.deepEqual(contested, []);
    assert.match(report, /1 items matching known holds/);
  });
});
