/**
 * lint-columns.js — xlsx 列間の整合を機械チェックする (エージェント不要の事前 lint)
 *
 * usage: node tools/verify/lint-columns.js   (事前に export-products.js で rows-full.json を最新化)
 *
 * 両辺が数値のときだけ検査する (空欄・テキスト値はスキップ)。違反は xlsx 内部の矛盾であり、
 * 照合スキャンにかける前に修正候補として洗い出せる。出力は助言のみ (exit 0)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR } from "./lib.js";

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const num = (v) => (/^\d+(\.\d+)?$/.test(String(v ?? "").trim()) ? Number(v) : null);

// [説明, 検査関数 (row) => 違反メッセージ | null]
const RULES = [
  ...["Input", "Output"].flatMap((d) => [
    [`S/PDIF (Optical) ${d} ≤ Optical Ports (${d})`, (r) => {
      const s = num(r[`S/PDIF (Optical) ${d}`]), p = num(r[`Optical Ports (${d})`]);
      return s !== null && p !== null && s > p ? `S/PDIF (Optical) ${d}=${s} > Optical Ports=${p}` : null;
    }],
    [`ADAT ${d} (ch@48kHz) は 8 の倍数かつ ≤ 8 × Optical Ports (${d})`, (r) => {
      const a = num(r[`ADAT ${d} (ch@48kHz)`]), p = num(r[`Optical Ports (${d})`]);
      if (a === null) return null;
      if (a % 8 !== 0) return `ADAT ${d}=${a} が 8 の倍数でない`;
      return p !== null && a > 8 * p ? `ADAT ${d}=${a} > 8 × Optical Ports (${p})` : null;
    }],
  ]),
];

let findings = 0;
for (const [i, r] of rows.entries()) {
  for (const [, check] of RULES) {
    const msg = check(r);
    if (msg) {
      findings++;
      console.log(`idx ${i} | ${r.Brand} ${r.Model} | ${msg}`);
    }
  }
}
console.log(findings ? `\n${findings} 件の列間矛盾候補 (照合前に確認を推奨)` : "列間の矛盾なし");
