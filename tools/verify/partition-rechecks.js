/**
 * partition-rechecks.js — sorts the verdicts of the examination (stage 2) into the input of stage 3 (resolving questions)
 *
 * usage: node tools/verify/partition-rechecks.js [rechecks-dir]
 *   rechecks-dir defaults to work/rechecks/. The output corrections-recheck.json is written to the input directory's parent
 *   (directly under work/ by default. Passing another directory when testing keeps work/ clean).
 *
 * Reads the work/rechecks/*.json of the current examination — the ids in contested-index.json, written after
 * export-contested wrote that index; older files are left over from an earlier cycle and are skipped — and generates
 * work/corrections-recheck.json, compatible with the corrections schema:
 *  - verdict = xlsx_correct       → hold (confirmed. No question needed, and apply skips it). It is also appended to
 *                                   known-holds.json (brand, model, column), so export-contested leaves it out from now on
 *  - verdict = page_correct       → proposed correction (unreviewed: true. Not applied until the operator confirms)
 *  - verdict = judgement_required → proposed correction or held (unreviewed: true + the material for the decision in note)
 * It also prints draft question batches (model | column | current value | proposal | quoted evidence) to the console.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { WORK_DIR } from "./lib.js";

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const RECHECKS = process.argv[2] ? resolve(process.argv[2]) : join(WORK_DIR, "rechecks");
const BASE = dirname(RECHECKS);
const OUT_FILE = join(BASE, "corrections-recheck.json");
const INDEX_FILE = join(BASE, "contested-index.json");
const HOLDS_FILE = join(BASE, "known-holds.json");

if (!existsSync(INDEX_FILE)) {
  console.error(`${INDEX_FILE} not found: run export-contested.js before the examination`);
  process.exit(1);
}
const currentIds = new Set(JSON.parse(readFileSync(INDEX_FILE, "utf8")));
const indexTime = statSync(INDEX_FILE).mtimeMs;
const holds = existsSync(HOLDS_FILE) ? JSON.parse(readFileSync(HOLDS_FILE, "utf8")) : [];
const holdKeys = new Set(holds.map((h) => `${h.brand}\u0000${h.model}\u0000${h.column}`));
const today = new Date().toISOString().slice(0, 10);

const entries = [];
const questions = [];
let nAutoHold = 0, nFix = 0, nJudge = 0, nFailed = 0, nNewHolds = 0;

const files = readdirSync(RECHECKS).filter((f) => /^product-\d{3,}\.json$/.test(f)).sort();
for (const f of files) {
  const idx = Number(f.match(/(\d{3,})/)[1]);
  if (!currentIds.has(idx) || statSync(join(RECHECKS, f)).mtimeMs < indexTime) {
    console.error(`skip ${f}: not part of the current examination (not in contested-index.json, or written before it)`);
    continue;
  }
  const r = JSON.parse(readFileSync(join(RECHECKS, f), "utf8"));
  const row = rows[idx];
  if (!row || r.brand !== row.Brand || r.model !== row.Model) {
    console.error(`skip ${f}: brand/model does not match rows-full (possibly left over from an idx shift; start again from export-contested)`);
    continue;
  }
  if (r.fetch_status === "failed") { nFailed++; continue; }
  for (const v of r.verdicts || []) {
    const current = String(row[v.column] ?? "");
    const base = { idx, brand: r.brand, model: r.model, column: v.column, current };
    if (v.verdict === "xlsx_correct") {
      nAutoHold++;
      entries.push({ ...base, proposed: current, hold: `Examination found the xlsx correct (${v.reason}): ${v.quote}`.slice(0, 500) });
      const key = `${r.brand}\u0000${r.model}\u0000${v.column}`;
      if (!holdKeys.has(key)) {
        holdKeys.add(key);
        holds.push({ brand: r.brand, model: r.model, column: v.column, note: `xlsx ${current} is correct (${v.reason}): ${v.quote}`.slice(0, 480) + ` (${today})` });
        nNewHolds++;
      }
    } else {
      const judge = v.verdict === "judgement_required";
      judge ? nJudge++ : nFix++;
      entries.push({ ...base, proposed: v.proposed ?? "", note: v.note ?? "", quote: v.quote, unreviewed: true, ...(judge && { judgement: true }) });
      questions.push({ ...base, verdict: v.verdict, reason: v.reason, proposed: v.proposed ?? "", quote: v.quote, note: v.note ?? "" });
    }
  }
}

writeFileSync(OUT_FILE, JSON.stringify(entries, null, 1));
console.log(`${OUT_FILE}: ${entries.length} entries (automatic hold ${nAutoHold} / proposed corrections ${nFix} / judgement required ${nJudge} / could not be fetched ${nFailed} models)`);
if (nNewHolds) {
  writeFileSync(HOLDS_FILE, JSON.stringify(holds, null, 1) + "\n");
  console.log(`${HOLDS_FILE}: appended ${nNewHolds} automatic holds (${holds.length} in total)`);
}

if (questions.length) {
  console.log("\n== Draft question batches (group by model and put to AskUserQuestion) ==");
  let prev = "";
  for (const q of questions) {
    const key = `${q.brand} ${q.model}`;
    if (key !== prev) { console.log(`\n--- ${key} (idx ${q.idx})`); prev = key; }
    console.log(`  [${q.verdict}/${q.reason}] ${q.column}: "${q.current}" -> "${q.proposed}"`);
    console.log(`    Evidence: ${q.quote.slice(0, 200)}`);
    if (q.note) console.log(`    note: ${q.note.slice(0, 150)}`);
  }
  console.log("\nSettle in this order: write the operator's decisions as a corrections JSON ({ idx, column, current, proposed }) → apply-corrections.js dry-run → --apply.");
} else {
  console.log("Nothing to ask (every contested item is confirmed or could not be fetched).");
}
