/**
 * propose-corrections.js — generates xlsx correction proposals from the mismatches in the verification results
 *
 * usage: node tools/verify/propose-corrections.js [--all]
 *   By default only mismatches with confidence=high. --all also includes low.
 *
 * Output: work/corrections-proposal.json — [{ idx, brand, model, column, current, proposed, confidence, evidence, notes }]
 * proposed is the raw text stated on the page and is not necessarily in a form usable as an xlsx cell value.
 * The operator (or Claude with the operator's consent) edits it to match the xlsx's existing format,
 * saves it as work/corrections-edited.json and passes it to apply-corrections.js
 * (build-report.js also inserts that file into the proposed-correction column of the discrepancy tables).
 * Applying always happens only after listing the changes and getting the operator's consent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR, scanResults } from "./lib.js";

const includeAll = process.argv.includes("--all");

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));

const proposals = [];
for (const { idx, r } of scanResults()) {
  if (!r || typeof r !== "object" || idx >= rows.length) continue;
  for (const x of r.mismatches || []) {
    if (!includeAll && x.confidence !== "high") continue;
    proposals.push({
      idx,
      brand: rows[idx].Brand,
      model: rows[idx].Model,
      column: x.column,
      current: rows[idx][x.column] ?? "",
      proposed: x.page_value,
      confidence: x.confidence,
      evidence: x.evidence ?? "",
      notes: r.notes ?? "",
    });
  }
}

const dst = join(WORK_DIR, "corrections-proposal.json");
writeFileSync(dst, JSON.stringify(proposals, null, 1));
console.log(`proposals: ${proposals.length} (${includeAll ? "high+low" : "high only"}) -> ${dst}`);
console.log("Next: the operator edits proposed into the cell-value format → dry-run with apply-corrections.js → --apply after consent");
