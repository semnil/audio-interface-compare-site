// tests/partition-rechecks.test.js
// Runs a copy of tools/verify/partition-rechecks.js on fixture rechecks and checks that it reads only the current
// examination (ids in contested-index.json, written after it), and that xlsx_correct verdicts are appended to
// known-holds.json once
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROWS = [
  { Brand: "Alpha", Model: "One", Notes: "note one", "Line Inputs": "2" },
  { Brand: "Beta", Model: "Two", Notes: "note two" },
  { Brand: "Gamma", Model: "Three", Notes: "note three" },
];
const recheck = (row, verdicts) => ({ brand: row.Brand, model: row.Model, fetch_status: "ok", verdicts });

describe("partition-rechecks: current examination only, holds appended", () => {
  let base, work, output, secondOutput;
  const run = () => execFileSync(process.execPath, [join(base, "tools", "verify", "partition-rechecks.js")], { cwd: base, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  before(() => {
    mkdirSync(join(ROOT, "work"), { recursive: true });
    base = mkdtempSync(join(ROOT, "work", "test-partition-rechecks-"));
    const verifyDir = join(base, "tools", "verify");
    work = join(verifyDir, "work");
    mkdirSync(join(work, "rechecks"), { recursive: true });
    for (const f of ["partition-rechecks.js", "lib.js"]) copyFileSync(join(ROOT, "tools", "verify", f), join(verifyDir, f));
    writeFileSync(join(work, "rows-full.json"), JSON.stringify(ROWS));
    writeFileSync(join(work, "known-holds.json"), JSON.stringify([{ brand: "Gamma", model: "Three", column: "Notes", note: "kept earlier" }]));

    const t = Date.now() / 1000;
    const write = (name, body, mtime) => {
      const p = join(work, name);
      writeFileSync(p, JSON.stringify(body));
      utimesSync(p, mtime, mtime);
    };
    write("contested-index.json", [0, 1], t - 100);
    // current: in the index and written after it
    write("rechecks/product-000.json", recheck(ROWS[0], [
      { column: "Notes", verdict: "xlsx_correct", reason: "page_omission", quote: "q-notes" },
      { column: "Line Inputs", verdict: "page_correct", reason: "xlsx_error", proposed: "4", quote: "q-line" },
    ]), t - 50);
    // left over from an earlier cycle: in the index but written before it
    write("rechecks/product-001.json", recheck(ROWS[1], [
      { column: "Notes", verdict: "page_correct", reason: "xlsx_error", proposed: "stale", quote: "q-stale" },
    ]), t - 500);
    // not part of the current examination
    write("rechecks/product-002.json", recheck(ROWS[2], [
      { column: "Notes", verdict: "page_correct", reason: "xlsx_error", proposed: "other", quote: "q-other" },
    ]), t - 50);

    output = run();
    secondOutput = run();
  });
  after(() => { if (base) rmSync(base, { recursive: true, force: true }); });

  test("only the current examination's verdicts become entries", () => {
    const entries = JSON.parse(readFileSync(join(work, "corrections-recheck.json"), "utf8"));
    assert.deepEqual(entries.map((e) => `${e.idx}:${e.column}`).sort(), ["0:Line Inputs", "0:Notes"], output);
    const fix = entries.find((e) => e.column === "Line Inputs");
    assert.equal(fix.proposed, "4");
    assert.equal(fix.unreviewed, true);
  });

  test("the xlsx_correct verdict is appended to known-holds.json once, keeping earlier holds", () => {
    const holds = JSON.parse(readFileSync(join(work, "known-holds.json"), "utf8"));
    assert.deepEqual(holds.map((h) => `${h.brand}|${h.model}|${h.column}`), ["Gamma|Three|Notes", "Alpha|One|Notes"]);
    assert.match(holds[1].note, /^xlsx note one is correct \(page_omission\): q-notes/);
    assert.ok(!/appended/.test(secondOutput), secondOutput);
  });
});
