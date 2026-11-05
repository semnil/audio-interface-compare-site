/**
 * lib.js — shared helpers for the node scripts in tools/verify
 *
 * Imported by export-products / validate-results / build-report / propose-corrections / apply-corrections.
 * workflow.js runs in the Workflow tool's sandbox and cannot import it, so it is out of scope
 * (when changing the status vocabulary, also sync the SCHEMA enum in workflow.js by hand).
 */
import { readFileSync, readdirSync, renameSync, existsSync, mkdirSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORK_DIR = join(__dirname, "work");
export const DATA_FILE = join(__dirname, "..", "..", "data", "audio_interfaces.xlsx");

export const STATUSES = new Set(["ok", "partial", "failed", "wrong_page"]);

// Columns the verification does not cover: they are left out of work/products/*.json and out of the
// change check that retires results in export-products (rows-full.json keeps every column)
export const UNVERIFIED_COLUMNS = new Set(["Measurement Reports"]);

// The part of a row that verification reads (every column except UNVERIFIED_COLUMNS). null/undefined gives null
export function verificationInput(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (!UNVERIFIED_COLUMNS.has(k)) out[k] = v;
  }
  return out;
}

// Known holds (work/known-holds.json) cover a discrepancy of their Brand + Model + column. A hold that carries the cell
// value it was confirmed with (`value`, written by partition-rechecks.js) covers it only while the cell still holds
// that value. Returns (row, column) => boolean
export function knownHoldMatcher(holds) {
  const byKey = new Map(holds.map((h) => [`${h.brand}\t${h.model}\t${h.column}`, h]));
  return (row, column) => {
    const h = byKey.get(`${row.Brand}\t${row.Model}\t${column}`);
    return h !== undefined && (h.value === undefined || h.value === String(row[column] ?? ""));
  };
}

export const pad = (i) => String(i).padStart(3, "0");
export const resultFile = (idx) => join(WORK_DIR, "results", `product-${pad(idx)}.json`);

// Moves a result file to results-retired/ with a timestamp (never deletes it)
export function retireResult(idx) {
  renameSync(resultFile(idx), join(WORK_DIR, "results-retired", `product-${pad(idx)}.json.${Date.now()}`));
}

// Comparison form of a name or value: NFKC, lower case, only a-z 0-9. "+" can be part of an identifier
// (Big Knob Studio / Studio+, etc.), so it is replaced with plus instead of removed
export const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");

// Brand + Model in comparison form, the form in which validate-results.js matches a result file to its row
const nameKey = (brand, model) => `${norm(brand)}\u0000${norm(model)}`;
const rowKey = (r) => (r && r.Brand !== undefined && r.Model !== undefined ? nameKey(r.Brand, r.Model) : null);

// The Brand + Model a result or recheck file was written for (its brand / model fields), or null
const fileKey = (path) => {
  try {
    const j = JSON.parse(readFileSync(path, "utf8"));
    return j && typeof j.brand === "string" && typeof j.model === "string" ? nameKey(j.brand, j.model) : null;
  } catch {
    return null;
  }
};

// When rows were added, removed or reordered since the previous export (oldRows = the previous rows-full.json), renames
// the idx-named files in work/results and work/rechecks so that each one sits at the idx of the Brand + Model it was
// written for (its brand / model fields; the previous rows-full.json for a file without them), compared in the form of
// norm, and moves the files of rows that are gone to results-retired/ and rechecks-retired/ with a timestamp. Files
// already at their row's idx stay, and files left in <dir>-follow-staging/ by an interrupted run are placed the same way,
// so a run after an interruption ends in the same state as an uninterrupted one. Returns { aligned, moved, gone }:
// aligned is oldRows rearranged into the new order (null for new rows). With two rows of the same Brand + Model in that
// form in either list it renames nothing and returns { aligned: oldRows, duplicate }.
export function followRowKeys(oldRows, rows) {
  const newKeys = rows.map(rowKey);
  const stagingOf = (sub) => join(WORK_DIR, `${sub}-follow-staging`);
  const leftover = ["results", "rechecks"].some((sub) => existsSync(stagingOf(sub)));
  if (!leftover && oldRows.length === rows.length && oldRows.every((r, i) => rowKey(r) === newKeys[i])) {
    return { aligned: oldRows, moved: 0, gone: 0 };
  }
  const duplicate = (r) => ({ aligned: oldRows, moved: 0, gone: 0, duplicate: rowKey(r) === null ? "(row without Brand/Model)" : `${r.Brand}\u0000${r.Model}` });
  const newIdx = new Map();
  for (const [i, k] of newKeys.entries()) {
    if (k === null || newIdx.has(k)) return duplicate(rows[i]);
    newIdx.set(k, i);
  }
  const oldKeys = new Set();
  for (const r of oldRows) {
    const k = rowKey(r);
    if (k === null || oldKeys.has(k)) return duplicate(r);
    oldKeys.add(k);
  }
  let moved = 0, gone = 0;
  for (const sub of ["results", "rechecks"]) {
    const dir = join(WORK_DIR, sub);
    const staging = stagingOf(sub);
    if (!existsSync(dir) && !existsSync(staging)) continue;
    mkdirSync(dir, { recursive: true });
    mkdirSync(staging, { recursive: true });
    const retire = (from, f) => {
      mkdirSync(join(WORK_DIR, `${sub}-retired`), { recursive: true });
      renameSync(join(from, f), join(WORK_DIR, `${sub}-retired`, `${f}.${Date.now()}`));
      gone++;
    };
    for (const f of readdirSync(dir)) {
      const m = /^product-(\d{3,})\.json$/.exec(f);
      if (!m) continue;
      const from = Number(m[1]);
      const k = fileKey(join(dir, f)) ?? rowKey(oldRows[from]);
      if (k === null) continue;
      const to = newIdx.get(k);
      if (to === from) continue;
      if (to === undefined) { retire(dir, f); continue; }
      const dest = join(staging, `product-${pad(to)}.json`);
      if (existsSync(dest)) throw new Error(`two ${sub} files for idx ${to}: ${f} and ${dest}`);
      renameSync(join(dir, f), dest);
      moved++;
    }
    for (const f of readdirSync(staging)) {
      const m = /^product-(\d{3,})\.json$/.exec(f);
      const k = fileKey(join(staging, f));
      const to = k !== null ? newIdx.get(k) : m ? Number(m[1]) : undefined;
      if (to === undefined) { retire(staging, f); continue; }
      const dest = join(dir, `product-${pad(to)}.json`);
      if (existsSync(dest)) throw new Error(`${sub}/product-${pad(to)}.json exists; ${f} is left in ${staging}`);
      renameSync(join(staging, f), dest);
    }
    rmdirSync(staging);
  }
  const aligned = rows.map(() => null);
  for (const r of oldRows) {
    const i = newIdx.get(rowKey(r));
    if (i !== undefined) aligned[i] = r;
  }
  return { aligned, moved, gone };
}

// Turns an exceljs cell value into plain text. Columns whose header contains url prefer the hyperlink.
// export-products (generating rows-full.json) and apply-corrections (checking current) using the same implementation
// is the premise of the check that "the value read by export equals the value read by apply"
export function plain(v, header = "") {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.hyperlink) return /url/i.test(header) ? v.hyperlink : (v.text ?? v.hyperlink);
    if (v.result !== undefined) return String(v.result);
    if (v.text !== undefined) return String(v.text);
    if (v instanceof Date) return v.toISOString();
    return JSON.stringify(v);
  }
  return String(v).trim();
}

// Reads the header row (row 1): byCol[column number] = header name, byName[header name] = column number
export function readHeaders(ws) {
  const byCol = [];
  const byName = {};
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const h = String(cell.value ?? "").trim();
    if (h) {
      byCol[col] = h;
      byName[h] = col;
    }
  });
  return { byCol, byName };
}

// Scans work/results/. Returns [{ idx, file, r, error }] in idx order (a parse failure gives r=null + error).
// The validity decision (move aside / skip / tolerate) is left to the caller's policy
export function scanResults() {
  const out = [];
  for (const f of readdirSync(join(WORK_DIR, "results"))) {
    const m = f.match(/^product-(\d{3,})\.json$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const file = join(WORK_DIR, "results", f);
    let r = null;
    let error = null;
    try {
      r = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      error = "JSON parse error";
    }
    out.push({ idx, file, r, error });
  }
  return out.sort((a, b) => a.idx - b.idx);
}
