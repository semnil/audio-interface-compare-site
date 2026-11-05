// tests/apply-corrections-row.test.js
// Runs a copy of tools/verify/apply-corrections.js on a fixture spreadsheet whose two rows hold the same value, and checks
// that an entry whose brand / model is not the row at its idx is rejected, while a matching entry and an entry without
// brand / model are applied, also when an earlier entry of the same row corrects its Brand or Model. Also checks whether
// a written value becomes a number or text
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("apply-corrections: an entry must name the row at its idx", () => {
  let base, data;
  const run = (corrections, apply) => {
    const file = join(base, "corrections.json");
    writeFileSync(file, JSON.stringify(corrections));
    const args = [join(base, "tools", "verify", "apply-corrections.js"), file, ...(apply ? ["--apply"] : [])];
    const r = spawnSync(process.execPath, args, { cwd: base, encoding: "utf8" });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const cellsOf = async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(data);
    const ws = wb.worksheets[0];
    return [2, 3].map((n) => ws.getRow(n).getCell(3).value);
  };

  before(async () => {
    // Under the repository's ignored work/ directory so that the copied script resolves exceljs from node_modules
    mkdirSync(join(ROOT, "work"), { recursive: true });
    base = mkdtempSync(join(ROOT, "work", "test-apply-corrections-"));
    mkdirSync(join(base, "tools", "verify"), { recursive: true });
    mkdirSync(join(base, "data"), { recursive: true });
    for (const f of ["apply-corrections.js", "lib.js"]) copyFileSync(join(ROOT, "tools", "verify", f), join(base, "tools", "verify", f));
    data = join(base, "data", "audio_interfaces.xlsx");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Audio Interfaces");
    ws.addRow(["Brand", "Model", "Line Inputs"]);
    ws.addRow(["Alpha", "One", 2]);
    ws.addRow(["Beta", "Two", 2]);
    await wb.xlsx.writeFile(data);
  });
  after(() => { if (base) rmSync(base, { recursive: true, force: true }); });

  test("an entry whose brand / model is another row's is rejected and nothing is written", async () => {
    const r = run([{ idx: 0, brand: "Beta", model: "Two", column: "Line Inputs", current: "2", proposed: "4" }], true);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /row mismatch/);
    assert.deepEqual(await cellsOf(), [2, 2]);
  });

  test("an entry naming its own row, and an entry without brand / model, are applied", async () => {
    const r = run([
      { idx: 1, brand: "Beta", model: "Two", column: "Line Inputs", current: "2", proposed: "4" },
      { idx: 0, column: "Line Inputs", current: "2", proposed: "3" },
    ], true);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /applicable 2 \/ inconsistent 0/);
    assert.deepEqual(await cellsOf(), [3, 4]);
  });
});

describe("apply-corrections: entries that correct Brand or Model are checked against the row's names before any write", () => {
  const spec = { idx: 0, brand: "Alpha", model: "One", column: "Line Inputs", current: "2", proposed: "4" };
  const renameModel = { idx: 0, brand: "Alpha", model: "One", column: "Model", current: "One", proposed: "One Mk II" };
  const renameBrand = { idx: 0, brand: "Alpha", model: "One", column: "Brand", current: "Alpha", proposed: "Alpha Audio" };
  const cases = [
    ["a Model correction before a spec correction of the same row", [renameModel, spec], ["Alpha", "One Mk II", 4]],
    ["a Brand correction before a spec correction of the same row", [renameBrand, spec], ["Alpha Audio", "One", 4]],
    ["a spec correction before a Model correction of the same row", [spec, renameModel], ["Alpha", "One Mk II", 4]],
    ["a valid entry with an entry naming another row writes nothing", [renameModel, { ...spec, idx: 1 }], null],
  ];
  for (const [label, corrections, expected] of cases) {
    test(label, async () => {
      mkdirSync(join(ROOT, "work"), { recursive: true });
      const base = mkdtempSync(join(ROOT, "work", "test-apply-corrections-"));
      try {
        mkdirSync(join(base, "tools", "verify"), { recursive: true });
        mkdirSync(join(base, "data"), { recursive: true });
        for (const f of ["apply-corrections.js", "lib.js"]) copyFileSync(join(ROOT, "tools", "verify", f), join(base, "tools", "verify", f));
        const data = join(base, "data", "audio_interfaces.xlsx");
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Audio Interfaces");
        ws.addRow(["Brand", "Model", "Line Inputs"]);
        ws.addRow(["Alpha", "One", 2]);
        ws.addRow(["Beta", "Two", 2]);
        await wb.xlsx.writeFile(data);
        const file = join(base, "corrections.json");
        writeFileSync(file, JSON.stringify(corrections));
        const r = spawnSync(process.execPath, [join(base, "tools", "verify", "apply-corrections.js"), file, "--apply"], { cwd: base, encoding: "utf8" });
        const out = r.stdout + r.stderr;
        const after = new ExcelJS.Workbook();
        await after.xlsx.readFile(data);
        const rows = [2, 3].map((n) => [1, 2, 3].map((c) => after.worksheets[0].getRow(n).getCell(c).value));
        if (expected) {
          assert.equal(r.status, 0, out);
          assert.deepEqual(rows, [expected, ["Beta", "Two", 2]]);
        } else {
          assert.equal(r.status, 1, out);
          assert.match(out, /row mismatch/);
          assert.deepEqual(rows, [["Alpha", "One", 2], ["Beta", "Two", 2]]);
        }
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }
});

describe("apply-corrections: a written pure number becomes a number", () => {
  const cases = [
    ["a text cell with the same digits", "Line Inputs", "2", "2", 2],
    ["a text cell with other digits", "Line Inputs", "2", "4", 4],
    ["a text range replaced by a single value", "Gain", "+10 to +65", "60", 60],
    ["a text cell with a decimal that reads the same", "EIN", "-127.5", "-127.5", -127.5],
    ["a text cell with a value that would read differently stays text", "EIN", "-127.5", "-127.0", "-127.0"],
    ["a text cell with a value that is not a pure number stays text", "Gain", "+10 to +65", "0 to +60", "0 to +60"],
    ["a numeric cell", "Mic Preamps", "2", "4", 4],
    ["an empty cell", "Notes", "", "4", 4],
    ["a digit-only Model stays text", "Model", "One", "624", "624"],
  ];
  for (const [label, column, current, proposed, expected] of cases) {
    test(label, async () => {
      mkdirSync(join(ROOT, "work"), { recursive: true });
      const base = mkdtempSync(join(ROOT, "work", "test-apply-corrections-"));
      try {
        mkdirSync(join(base, "tools", "verify"), { recursive: true });
        mkdirSync(join(base, "data"), { recursive: true });
        for (const f of ["apply-corrections.js", "lib.js"]) copyFileSync(join(ROOT, "tools", "verify", f), join(base, "tools", "verify", f));
        const data = join(base, "data", "audio_interfaces.xlsx");
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Audio Interfaces");
        const headers = ["Brand", "Model", "Line Inputs", "Gain", "EIN", "Mic Preamps", "Notes"];
        ws.addRow(headers);
        ws.addRow(["Alpha", "One", "2", "+10 to +65", "-127.5", 2, null]);
        await wb.xlsx.writeFile(data);
        const file = join(base, "corrections.json");
        writeFileSync(file, JSON.stringify([{ idx: 0, brand: "Alpha", model: "One", column, current, proposed }]));
        const r = spawnSync(process.execPath, [join(base, "tools", "verify", "apply-corrections.js"), file, "--apply"], { cwd: base, encoding: "utf8" });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const after = new ExcelJS.Workbook();
        await after.xlsx.readFile(data);
        assert.strictEqual(after.worksheets[0].getRow(2).getCell(headers.indexOf(column) + 1).value, expected);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }
});
