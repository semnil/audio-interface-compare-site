// tests/xlsx-main-output.test.js
// Contract test for the Analog Main Output column of data/audio_interfaces.xlsx: it holds the main L/R pair (at most 2),
// and every other analog line-level output, including extra speaker pairs and outputs of units without a dedicated
// main pair, is counted in Analog Line Output (the cell format conventions of the verify-products skill).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data", "audio_interfaces.xlsx");

describe("xlsx: Analog Main Output counts only the main L/R pair", () => {
  test("no row has more than 2 analog main outputs", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA);
    const ws = wb.worksheets[0];
    const hdr = [];
    ws.getRow(1).eachCell((c, n) => { hdr[n] = String(c.value).trim(); });
    const col = hdr.indexOf("Analog Main Output");
    assert.ok(col > 0, "column not found: Analog Main Output");

    const offenders = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const v = row.getCell(col).value;
      if (v === null || v === undefined || v === "") return;
      if (!(Number(v) <= 2)) offenders.push(`${row.getCell(1).value} ${row.getCell(2).value} = ${JSON.stringify(v)}`);
    });
    assert.equal(offenders.length, 0, `rows with more than 2 analog main outputs:\n  ${offenders.join("\n  ")}`);
  });
});
