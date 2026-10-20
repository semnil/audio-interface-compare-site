/**
 * validate-results.js — soundness validation of the verification result files and computing incomplete ids
 *
 * usage: node tools/verify/validate-results.js [--retry-failed] [--include-partial]
 *   --retry-failed    adds results with fetch_status=failed to the retry targets (old results are moved to results-retired/)
 *   --include-partial also adds fetch_status=partial to the retry targets (same as above)
 *
 * Validates each work/results/product-NNN.json against the actual xlsx data (rows-full.json):
 *  - whether the copied brand / model match the corresponding row (detects contamination from verifying a different row)
 *  - whether the xlsx_value quoted in a mismatch is consistent with the corresponding row's actual value
 *  - detecting results written with the input file missing (notes="input file missing")
 *  - whether there is wording that suggests missing input or rebuilding (warning)
 * Invalid files are moved to work/results-invalid/ and treated as incomplete.
 *
 * Output: work/state.json — { validCount, invalid, warns, missingIds, retiredIds, nextIds }
 * Passing nextIds as is to workflow.js's args.ids resumes from where it stopped.
 * The end condition is "missingIds is empty". failed may remain when caused by bot protection (the report states it as unverified).
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR, STATUSES, pad, scanResults, retireResult } from "./lib.js";

const retryFailed = process.argv.includes("--retry-failed");
const includePartial = process.argv.includes("--include-partial");

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
// "+" can be part of an identifier (Big Knob Studio / Studio+, etc.), so it is replaced with plus instead of removed
const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");

const REQUIRED = ["brand", "model", "fetch_status", "mismatches", "not_stated", "missing_in_xlsx", "notes"];
const ARRAYS = ["attempts", "sources", "mismatches", "not_stated", "missing_in_xlsx"];
const MARKERS = [
  "入力ファイル /private", "Input file /private", "was missing from", "absent from the scratchpad",
  "存在しなかったため", "存在せず、", "再構成して照合", "reconstructed from data/", "regenerated from data/", "唯一存在した",
];

const valid = new Map(); // idx -> { r, file }
const invalid = [];
const warns = [];

for (const { idx, file: path, r: parsed, error } of scanResults()) {
  const problems = [];
  let r = parsed;
  if (error) problems.push(error);
  if (!problems.length && (r === null || typeof r !== "object" || Array.isArray(r))) {
    problems.push("top-level is not an object");
    r = null;
  }
  if (r && !problems.length) {
    if (idx >= rows.length) problems.push(`idx ${idx} out of range`);
    for (const k of REQUIRED) if (!(k in r)) problems.push(`missing key: ${k}`);
    for (const k of ARRAYS) if (k in r && !Array.isArray(r[k])) problems.push(`not an array: ${k}`);
    if (r.fetch_status && !STATUSES.has(r.fetch_status)) problems.push(`bad fetch_status: ${r.fetch_status}`);
  }
  if (r && !problems.length) {
    const row = rows[idx];
    if (String(r.notes).includes("input file missing")) {
      // A result written with the input missing. Needs re-verification after restoring the input (export)
      problems.push("verified without input file (notes=input file missing)");
    } else {
      // Detecting contamination from a different row: the copied brand/model must match the corresponding row
      if (norm(r.brand) !== norm(row.Brand) || norm(r.model) !== norm(row.Model)) {
        problems.push(`brand/model mismatch: file="${r.brand} ${r.model}" row="${row.Brand} ${row.Model}"`);
      }
      // The xlsx_value quoted in a mismatch must not contradict the actual value (checked only when the column name exists)
      for (const x of r.mismatches || []) {
        const actual = row[x.column];
        if (actual === undefined) continue;
        const a = norm(x.xlsx_value), b = norm(actual);
        if (a && b && !(a === b || a.includes(b) || b.includes(a))) {
          problems.push(`mismatch value contradiction [${x.column}]: claimed="${x.xlsx_value}" actual="${actual}"`);
        }
      }
      // Traces of missing input or rebuilding are warnings (the result itself is kept when brand/model and the values are valid)
      const hitMarkers = MARKERS.filter((w) => String(r.notes || "").includes(w));
      if (hitMarkers.length) warns.push({ idx, markers: hitMarkers });
    }
  }
  if (problems.length) {
    const dst = join(WORK_DIR, "results-invalid", `product-${pad(idx)}.json.${Date.now()}`);
    renameSync(path, dst);
    invalid.push({ idx, problems, movedTo: dst });
  } else if (r) {
    valid.set(idx, { r, file: path });
  }
}

// Retrying failed / partial (opt-in): moves the old results aside and returns them to incomplete
const retiredIds = [];
if (retryFailed || includePartial) {
  mkdirSync(join(WORK_DIR, "results-retired"), { recursive: true });
  for (const [idx, { r }] of valid) {
    const retire = (retryFailed && r.fetch_status === "failed") || (includePartial && r.fetch_status === "partial");
    if (!retire) continue;
    retireResult(idx);
    valid.delete(idx);
    retiredIds.push(idx);
  }
}

const missingIds = [];
for (let i = 0; i < rows.length; i++) if (!valid.has(i)) missingIds.push(i);

const state = {
  generatedAt: new Date().toISOString(),
  flags: { retryFailed, includePartial },
  total: rows.length,
  validCount: valid.size,
  byStatus: [...valid.values()].reduce((acc, { r }) => ((acc[r.fetch_status] = (acc[r.fetch_status] || 0) + 1), acc), {}),
  invalid,
  warns,
  retiredIds,
  missingIds,
  nextIds: missingIds,
};
writeFileSync(join(WORK_DIR, "state.json"), JSON.stringify(state, null, 1));

console.log(`valid: ${valid.size}/${rows.length}  byStatus: ${JSON.stringify(state.byStatus)}`);
console.log(`invalid (moved aside): ${invalid.length}  warn: ${warns.length}  retired (retry targets): ${retiredIds.length}`);
for (const x of invalid) console.log(`  invalid idx ${x.idx}: ${x.problems.join(" / ")}`);
if (missingIds.length) {
  console.log(`nextIds (${missingIds.length}): ${JSON.stringify(missingIds)}`);
} else {
  const failedLeft = state.byStatus.failed || 0;
  console.log(`nextIds: none — verification complete${failedLeft ? ` (${failedLeft} failed are tolerated as unverified because of bot protection or similar. Retry with --retry-failed)` : ""}. The report can be generated with node tools/verify/build-report.js`);
}
