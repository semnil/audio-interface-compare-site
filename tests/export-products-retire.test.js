// tests/export-products-retire.test.js
// Runs a copy of tools/verify/export-products.js against a small fixture spreadsheet and checks what it does to the
// verification results of the previous export: a change only in Measurement Reports keeps the result, a change in a
// verified column retires it, products/*.json leaves Measurement Reports out, and when rows are added or removed the
// result and recheck files follow their Brand + Model to the new idx
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEADERS = ["Brand", "Model", "Notes", "Measurement Reports"];
const toRow = (r) => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]]).filter(([, v]) => v !== ""));

// Builds a copy of export-products.js + lib.js with the given spreadsheet rows, previous rows-full.json and idx-named
// result / recheck files ({ idx: { brand, model } }), runs it and returns the work directory and its output. When the
// export fails, the copy is removed before the error is rethrown
async function runExport({ current, previous, results, rechecks = {}, staging = {} }) {
  // Under the repository's ignored work/ directory so that the copied script resolves exceljs from node_modules
  mkdirSync(join(ROOT, "work"), { recursive: true });
  const base = mkdtempSync(join(ROOT, "work", "test-export-products-"));
  const verifyDir = join(base, "tools", "verify");
  const work = join(verifyDir, "work");
  mkdirSync(join(work, "results"), { recursive: true });
  mkdirSync(join(work, "rechecks"), { recursive: true });
  mkdirSync(join(base, "data"), { recursive: true });
  for (const f of ["export-products.js", "lib.js"]) copyFileSync(join(ROOT, "tools", "verify", f), join(verifyDir, f));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Audio Interfaces");
  ws.addRow(HEADERS);
  for (const r of current) ws.addRow(r);
  await wb.xlsx.writeFile(join(base, "data", "audio_interfaces.xlsx"));

  writeFileSync(join(work, "rows-full.json"), JSON.stringify(previous.map(toRow)));
  for (const [sub, files] of [["results", results], ["rechecks", rechecks], ...Object.entries(staging).map(([s, f]) => [`${s}-follow-staging`, f])]) {
    mkdirSync(join(work, sub), { recursive: true });
    for (const [idx, body] of Object.entries(files)) {
      writeFileSync(join(work, sub, `product-${String(idx).padStart(3, "0")}.json`), JSON.stringify(body));
    }
  }
  try {
    const output = execFileSync(process.execPath, [join(verifyDir, "export-products.js")], { cwd: base, encoding: "utf8" });
    return { base, work, output };
  } catch (err) {
    rmSync(base, { recursive: true, force: true });
    throw err;
  }
}

const readModel = (work, sub, idx) => JSON.parse(readFileSync(join(work, sub, `product-${String(idx).padStart(3, "0")}.json`), "utf8")).model;

describe("export-products: retiring verification results", () => {
  let run;
  before(async () => {
    run = await runExport({
      current: [
        ["Alpha", "One", "note one", "[New](https://example.com/one-new)"],
        ["Beta", "Two", "note two, edited", "[Same](https://example.com/two)"],
        ["Gamma", "Three", "note three", "[Same](https://example.com/three)"],
      ],
      previous: [
        ["Alpha", "One", "note one", "[Old](https://example.com/one-old)"],
        ["Beta", "Two", "note two", "[Same](https://example.com/two)"],
        ["Gamma", "Three", "note three", "[Same](https://example.com/three)"],
      ],
      results: { 0: { brand: "Alpha", model: "One" }, 1: { brand: "Beta", model: "Two" }, 2: { brand: "Gamma", model: "Three" } },
    });
  });
  after(() => { if (run) rmSync(run.base, { recursive: true, force: true }); });

  test("a row whose only change is Measurement Reports keeps its result", () => {
    assert.ok(existsSync(join(run.work, "results", "product-000.json")), `product-000.json was retired; output: ${run.output}`);
  });

  test("a row whose verified column changed has its result retired", () => {
    assert.ok(!existsSync(join(run.work, "results", "product-001.json")), "product-001.json was kept");
    const retired = readdirSync(join(run.work, "results-retired"));
    assert.deepEqual(retired.map((f) => f.split(".json")[0]), ["product-001"]);
  });

  test("an unchanged row keeps its result", () => {
    assert.ok(existsSync(join(run.work, "results", "product-002.json")));
  });

  test("products/*.json leaves Measurement Reports out and rows-full.json keeps it", () => {
    const product = JSON.parse(readFileSync(join(run.work, "products", "product-000.json"), "utf8"));
    assert.deepEqual(product, { Brand: "Alpha", Model: "One", Notes: "note one" });
    const full = JSON.parse(readFileSync(join(run.work, "rows-full.json"), "utf8"));
    assert.equal(full[0]["Measurement Reports"], "[New](https://example.com/one-new)");
  });
});

describe("export-products: results follow their row when rows are added and removed", () => {
  let run;
  before(async () => {
    // A new row sorts in at the top and Beta is removed: Alpha moves 0 -> 1, Gamma stays at 2
    run = await runExport({
      current: [
        ["Aardvark", "New", "a new row", ""],
        ["Alpha", "One", "note one", ""],
        ["Gamma", "Three", "note three", ""],
      ],
      previous: [
        ["Alpha", "One", "note one", ""],
        ["Beta", "Two", "note two", ""],
        ["Gamma", "Three", "note three", ""],
      ],
      results: { 0: { brand: "Alpha", model: "One" }, 1: { brand: "Beta", model: "Two" }, 2: { brand: "Gamma", model: "Three" } },
      rechecks: { 0: { brand: "Alpha", model: "One" }, 1: { brand: "Beta", model: "Two" } },
    });
  });
  after(() => { if (run) rmSync(run.base, { recursive: true, force: true }); });

  test("unchanged rows keep their results at the new idx", () => {
    assert.equal(readModel(run.work, "results", 1), "One", `output: ${run.output}`);
    assert.equal(readModel(run.work, "results", 2), "Three");
    assert.ok(!existsSync(join(run.work, "results", "product-000.json")), "the new row got a result");
  });

  test("the removed row's result and recheck are moved aside, and recheck files follow too", () => {
    assert.deepEqual(readdirSync(join(run.work, "results-retired")).map((f) => f.split(".json")[0]), ["product-001"]);
    assert.deepEqual(readdirSync(join(run.work, "rechecks-retired")).map((f) => f.split(".json")[0]), ["product-001"]);
    assert.equal(readModel(run.work, "rechecks", 1), "One");
    assert.ok(!existsSync(join(run.work, "rechecks", "product-000.json")));
  });

  test("no result of an unchanged row is reported as changed", () => {
    assert.ok(!/row changed/.test(run.output), run.output);
  });
});

describe("export-products: a run after an interrupted one places the files like an uninterrupted run", () => {
  // Alpha is removed. An interrupted export has already moved some files but has not written rows-full.json, so the
  // previous rows still list Alpha, Beta, Gamma
  const previous = [["Alpha", "One", "a", ""], ["Beta", "Two", "b", ""], ["Gamma", "Three", "c", ""]];
  const current = [["Beta", "Two", "b", ""], ["Gamma", "Three", "c", ""]];
  const B = { brand: "Beta", model: "Two" };
  const G = { brand: "Gamma", model: "Three" };
  const cases = [
    ["results moved, rechecks not yet", { results: { 0: B, 1: G }, rechecks: { 1: B, 2: G } }],
    ["results and rechecks moved", { results: { 0: B, 1: G }, rechecks: { 0: B, 1: G } }],
    ["a result left in the staging directory", { results: { 0: B }, rechecks: { 1: B, 2: G }, staging: { results: { 1: G } } }],
  ];
  for (const [label, files] of cases) {
    test(label, async () => {
      const run = await runExport({ current, previous, ...files });
      try {
        for (const sub of ["results", "rechecks"]) {
          assert.deepEqual(readdirSync(join(run.work, sub)).sort(), ["product-000.json", "product-001.json"], `${sub}: ${run.output}`);
          assert.equal(readModel(run.work, sub, 0), "Two", `${sub}/product-000.json`);
          assert.equal(readModel(run.work, sub, 1), "Three", `${sub}/product-001.json`);
        }
        assert.ok(!existsSync(join(run.work, "results-follow-staging")), "the staging directory is left");
        assert.ok(!/row changed/.test(run.output), run.output);
      } finally {
        rmSync(run.base, { recursive: true, force: true });
      }
    });
  }
});

describe("export-products: a result follows its row when its brand / model differ from the row only in case and punctuation", () => {
  // validate-results.js matches a result to its row in the form of norm (tools/verify/lib.js), so following does too
  test("Alpha moves 0 -> 1 with a result written for ALPHA / one", async () => {
    const run = await runExport({
      current: [["Aardvark", "New", "a", ""], ["Alpha", "One", "b", ""], ["Beta", "Two", "c", ""]],
      previous: [["Alpha", "One", "b", ""], ["Beta", "Two", "c", ""]],
      results: { 0: { brand: "ALPHA", model: "one" }, 1: { brand: "Beta", model: "Two" } },
    });
    try {
      assert.deepEqual(readdirSync(join(run.work, "results")).sort(), ["product-001.json", "product-002.json"], run.output);
      assert.equal(readModel(run.work, "results", 1), "one");
      assert.equal(readModel(run.work, "results", 2), "Two");
      assert.deepEqual(readdirSync(join(run.work, "results-retired")), [], "a result was moved aside");
    } finally {
      rmSync(run.base, { recursive: true, force: true });
    }
  });
});
