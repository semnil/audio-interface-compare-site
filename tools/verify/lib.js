/**
 * lib.js — shared helpers for the node scripts in tools/verify
 *
 * Imported by export-products / validate-results / build-report / propose-corrections / apply-corrections.
 * workflow.js runs in the Workflow tool's sandbox and cannot import it, so it is out of scope
 * (when changing the status vocabulary, also sync the SCHEMA enum in workflow.js by hand).
 */
import { readFileSync, readdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORK_DIR = join(__dirname, "work");
export const DATA_FILE = join(__dirname, "..", "..", "data", "audio_interfaces.xlsx");

export const STATUSES = new Set(["ok", "partial", "failed", "wrong_page"]);

export const pad = (i) => String(i).padStart(3, "0");
export const resultFile = (idx) => join(WORK_DIR, "results", `product-${pad(idx)}.json`);

// Moves a result file to results-retired/ with a timestamp (never deletes it)
export function retireResult(idx) {
  renameSync(resultFile(idx), join(WORK_DIR, "results-retired", `product-${pad(idx)}.json.${Date.now()}`));
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
