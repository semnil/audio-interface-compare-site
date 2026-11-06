// tests/xlsx-header-check.test.js
// The build stops when the first sheet's header row and COLUMNS do not name the same columns, or when no product row is left
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { COLUMNS, _checkHeaders as checkHeaders, _readXlsx as readXlsx } from "../src/build.js";

const LABELS = COLUMNS.map((c) => c.label);

describe("checkHeaders", () => {
  test("the labels of COLUMNS in any order pass", () => {
    assert.doesNotThrow(() => checkHeaders(LABELS));
    assert.doesNotThrow(() => checkHeaders([...LABELS].reverse()));
  });

  test("a renamed header is named as both unknown and missing", () => {
    const headers = LABELS.map((l) => (l === "Mic Preamps" ? "Mic Pres" : l));
    assert.throws(() => checkHeaders(headers), /not in COLUMNS \["Mic Pres"\], missing from the sheet \["Mic Preamps"\]/);
  });

  test("a header no label matches fails", () => {
    assert.throws(() => checkHeaders([...LABELS, "Weight"]), /not in COLUMNS \["Weight"\]/);
  });

  test("a label with no header fails", () => {
    assert.throws(() => checkHeaders(LABELS.filter((l) => l !== "Notes")), /missing from the sheet \["Notes"\]/);
  });

  test("a repeated header fails", () => {
    assert.throws(() => checkHeaders([...LABELS, "Brand"]), /repeated \["Brand"\]/);
  });
});

describe("readXlsx", () => {
  let dir;
  const write = async (name, headers, rows) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.addRow(headers);
    for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? null));
    const file = join(dir, name);
    await wb.xlsx.writeFile(file);
    return file;
  };

  before(() => { dir = mkdtempSync(join(tmpdir(), "aics-header-")); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test("the repository's spreadsheet passes and gives product rows", async () => {
    const products = await readXlsx();
    assert.ok(products.length > 0);
    assert.ok(products.every((p) => p.slug && p.displayName));
  });

  test("a fixture with the right headers is read", async () => {
    const file = await write("ok.xlsx", LABELS, [{ Brand: "Acme", Model: "One", "Mic Preamps": 2 }]);
    const products = await readXlsx(file);
    assert.equal(products.length, 1);
    assert.equal(products[0].slug, "acme-one");
    assert.equal(products[0].micPre, 2);
  });

  test("a renamed Brand header stops the read instead of giving an empty site", async () => {
    const headers = LABELS.map((l) => (l === "Brand" ? "Maker" : l));
    const file = await write("renamed-brand.xlsx", headers, [{ Maker: "Acme", Model: "One" }]);
    await assert.rejects(readXlsx(file), /xlsx header mismatch/);
  });

  test("a renamed spec header stops the read instead of emptying the column", async () => {
    const headers = LABELS.map((l) => (l === "Mic Preamps" ? "Mic Pres" : l));
    const file = await write("renamed-spec.xlsx", headers, [{ Brand: "Acme", Model: "One", "Mic Pres": 2 }]);
    await assert.rejects(readXlsx(file), /xlsx header mismatch/);
  });

  test("a sheet with headers and no product row stops the read", async () => {
    const file = await write("empty.xlsx", LABELS, []);
    await assert.rejects(readXlsx(file), /no product rows/);
  });
});
