// tests/update-xlsx-order.test.js
// Runs a copy of tools/update-xlsx.js (dry-run) on a fixture spreadsheet and checks the order of the Measurement Reports
// links it would write: independent sources in the order given, then the manufacturer links
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("update-xlsx: link order", () => {
  let base, output;
  before(async () => {
    // Under the repository's ignored work/ directory so that the copied script resolves exceljs from node_modules
    mkdirSync(join(ROOT, "work"), { recursive: true });
    base = mkdtempSync(join(ROOT, "work", "test-update-xlsx-"));
    mkdirSync(join(base, "tools"), { recursive: true });
    mkdirSync(join(base, "data"), { recursive: true });
    copyFileSync(join(ROOT, "tools", "update-xlsx.js"), join(base, "tools", "update-xlsx.js"));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Audio Interfaces");
    ws.addRow(["Brand", "Model", "Measurement Reports"]);
    ws.addRow(["Alpha", "One", ""]);
    ws.addRow(["Beta", "Two", ""]);
    await wb.xlsx.writeFile(join(base, "data", "audio_interfaces.xlsx"));
    writeFileSync(join(base, "result.json"), JSON.stringify({
      products: [
        { product: "Alpha One", urls: [
          { source: "Manufacturer", url: "https://example.com/one-spec" },
          { source: "YouTube", url: "https://www.youtube.com/watch?v=one" },
        ] },
        { product: "Beta Two", urls: [
          { source: "ASR", url: "https://www.audiosciencereview.com/forum/two" },
          { source: "Manufacturer", url: "https://example.com/two-spec" },
          { source: "YouTube", url: "https://www.youtube.com/watch?v=two" },
        ] },
      ],
    }));
    output = execFileSync(process.execPath, [join(base, "tools", "update-xlsx.js"), join(base, "result.json")], { cwd: base, encoding: "utf8" });
  });
  after(() => { if (base) rmSync(base, { recursive: true, force: true }); });

  test("a manufacturer link listed first moves after the independent source", () => {
    assert.ok(output.includes("  Alpha One: [YouTube](https://www.youtube.com/watch?v=one) / [Manufacturer](https://example.com/one-spec)"), output);
  });

  test("independent sources keep their order and the manufacturer link goes last", () => {
    assert.ok(output.includes("  Beta Two: [ASR](https://www.audiosciencereview.com/forum/two) / [YouTube](https://www.youtube.com/watch?v=two) / [Manufacturer](https://example.com/two-spec)"), output);
  });
});
