// tests/xlsx-numeric-cells.test.js
// Contract test that the columns of data/audio_interfaces.xlsx that should "always be numeric" are stored as numeric cells
// rather than text strings. Values of added rows (new-rows JSON) tend to all be strings,
// and writing them as is turns the reference price and the like into text instead of numbers. coerceNumericCells in
// apply-product-changes.js prevents this. This test detects a recurrence of that bug.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data", "audio_interfaces.xlsx");

// Columns that must be numeric only (blank allowed) in every row. I/O count and measurement columns historically mix in strings, so they are excluded.
const ALWAYS_NUMERIC = ["Reference Price (USD)", "Max Sample Rate (kHz)", "Max Bit Depth (bit)"];

describe("xlsx: type contract for columns that should always be numeric", () => {
  test("reference price, sample rate, and bit depth are numbers, not text", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA);
    const ws = wb.worksheets[0];
    const hdr = [];
    ws.getRow(1).eachCell((c, n) => { hdr[n] = String(c.value).trim(); });

    const colOf = {};
    for (const name of ALWAYS_NUMERIC) {
      const idx = hdr.indexOf(name);
      assert.ok(idx > 0, `column not found: ${name}`);
      colOf[name] = idx;
    }

    const offenders = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      for (const name of ALWAYS_NUMERIC) {
        const v = row.getCell(colOf[name]).value;
        if (v === null || v === undefined || v === "") continue;
        if (typeof v !== "number") {
          offenders.push(`${row.getCell(1).value} ${row.getCell(2).value} | ${name} = ${JSON.stringify(v)} (${typeof v})`);
        }
      }
    });
    assert.equal(offenders.length, 0, `cells that are text instead of numbers:\n  ${offenders.join("\n  ")}`);
  });
});
