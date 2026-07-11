/**
 * validate-results.js — 照合結果ファイルの健全性検証と未完了 ids の算出
 *
 * usage: node tools/verify/validate-results.js [--retry-failed] [--include-partial]
 *   --retry-failed    fetch_status=failed の結果を再試行対象に加える (旧結果は results-retired/ へ退避)
 *   --include-partial fetch_status=partial も再試行対象に加える (同上)
 *
 * 各 work/results/product-NNN.json を xlsx 実データ (rows-full.json) と突き合わせて検証する:
 *  - brand / model の写しが該当行と一致するか (別行を照合した汚染の検出)
 *  - mismatch の xlsx_value 引用が該当行の実値と矛盾しないか
 *  - 入力ファイル欠損のまま書かれた結果 (notes="input file missing") の検出
 *  - 入力欠損・再構成をうかがわせる文言の有無 (警告)
 * 不正ファイルは work/results-invalid/ へ退避し、未完了扱いにする。
 *
 * 出力: work/state.json — { validCount, invalid, warns, missingIds, retiredIds, nextIds }
 * nextIds をそのまま workflow.js の args.ids に渡せば途中から再開できる。
 * 終了条件は「missingIds が空」。failed はボット保護由来なら残してよい (未照合としてレポートに明示される)。
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR, STATUSES, pad, scanResults, retireResult } from "./lib.js";

const retryFailed = process.argv.includes("--retry-failed");
const includePartial = process.argv.includes("--include-partial");

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
// "+" は識別子になり得る (Big Knob Studio / Studio+ など) ため除去せず plus に置換する
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
      // 入力欠損のまま書かれた結果。入力を復旧 (export) した上で再照合が必要
      problems.push("verified without input file (notes=input file missing)");
    } else {
      // 別行汚染の検出: brand/model の写しが該当行と一致すること
      if (norm(r.brand) !== norm(row.Brand) || norm(r.model) !== norm(row.Model)) {
        problems.push(`brand/model mismatch: file="${r.brand} ${r.model}" row="${row.Brand} ${row.Model}"`);
      }
      // mismatch の xlsx_value 引用が実値と矛盾しないこと (列名が実在する場合のみ判定)
      for (const x of r.mismatches || []) {
        const actual = row[x.column];
        if (actual === undefined) continue;
        const a = norm(x.xlsx_value), b = norm(actual);
        if (a && b && !(a === b || a.includes(b) || b.includes(a))) {
          problems.push(`mismatch value contradiction [${x.column}]: claimed="${x.xlsx_value}" actual="${actual}"`);
        }
      }
      // 入力欠損・再構成の痕跡は警告 (brand/model と値が正当なら結果自体は保持)
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

// failed / partial の再試行 (オプトイン): 旧結果を退避して未完了に戻す
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
console.log(`invalid (退避済): ${invalid.length}  warn: ${warns.length}  retired (再試行対象): ${retiredIds.length}`);
for (const x of invalid) console.log(`  invalid idx ${x.idx}: ${x.problems.join(" / ")}`);
if (missingIds.length) {
  console.log(`nextIds (${missingIds.length} 件): ${JSON.stringify(missingIds)}`);
} else {
  const failedLeft = state.byStatus.failed || 0;
  console.log(`nextIds: なし — 照合完了${failedLeft ? ` (failed ${failedLeft} 件はボット保護等による未照合として許容。再挑戦は --retry-failed)` : ""}。node tools/verify/build-report.js でレポート生成可`);
}
