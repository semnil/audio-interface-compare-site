// tests/apply-corrections-row.test.js
// Runs a copy of tools/verify/apply-corrections.js on a fixture spreadsheet whose two rows hold the same value, and checks
// that an entry whose brand / model is not the row at its idx is rejected, while a matching entry and an entry without
// brand / model are applied
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
