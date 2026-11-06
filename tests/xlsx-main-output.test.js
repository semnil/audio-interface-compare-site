// tests/xlsx-main-output.test.js
// Contract test for the Analog Main Output column of data/audio_interfaces.xlsx: it holds the main L/R pair (at most 2),
// and every other analog line-level output, including extra speaker pairs and outputs of units without a dedicated
// main pair, is counted in Analog Line Output (the cell format conventions of the verify-products skill). A row with
// two or more line outputs and no main output is one of the listed exceptions.
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

  // Rows whose two or more analog line outputs are not a main L/R pair: Brand + Model -> what the outputs are
  const NOT_A_MAIN_PAIR = new Map([
    ["Maono\tMaonocaster E2", "a 3.5mm monitor out and two 3.5mm TRRS stream outs to a phone, three separate stereo jacks"],
    ["Roland\tBridge Cast", "one stereo line jack and a smartphone TRRS jack"],
    ["Roland\tBridge Cast One", "one stereo line jack and a smartphone TRRS jack"],
    ["Roland\tBridge Cast X", "one stereo line jack and a smartphone TRRS jack"],
    ["YAMAHA\tZG01", "one stereo speaker jack and a smartphone TRRS jack"],
    ["Mackie\tM•Caster Live", "one stereo speaker jack and a smartphone TRRS jack"],
  ]);

  test("a row with two or more analog line outputs and no main output counts the main L/R pair in Analog Main Output", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA);
    const ws = wb.worksheets[0];
    const hdr = [];
    ws.getRow(1).eachCell((c, n) => { hdr[n] = String(c.value).trim(); });
    const main = hdr.indexOf("Analog Main Output");
    const line = hdr.indexOf("Analog Line Output");
    assert.ok(main > 0 && line > 0, "columns not found: Analog Main Output / Analog Line Output");

    const offenders = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const m = row.getCell(main).value;
      if (m !== null && m !== undefined && m !== "") return;
      const l = Number(row.getCell(line).value);
      if (!(l >= 2)) return;
      const key = `${row.getCell(1).value}\t${row.getCell(2).value}`;
      if (!NOT_A_MAIN_PAIR.has(key)) offenders.push(`${row.getCell(1).value} ${row.getCell(2).value}: Analog Line Output ${l}`);
    });
    assert.equal(offenders.length, 0, `rows with no main output and two or more line outputs:\n  ${offenders.join("\n  ")}`);
  });
});
