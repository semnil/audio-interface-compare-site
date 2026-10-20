/**
 * lint-columns.js — mechanically checks consistency between xlsx columns (a pre-lint that needs no agents)
 *
 * usage: node tools/verify/lint-columns.js   (refresh rows-full.json with export-products.js first)
 *
 * Checks only when both sides are numeric (blanks and text values are skipped). A violation is a contradiction inside the xlsx
 * and can be found as a proposed correction before the verification scan. The output is advice only (exit 0).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR } from "./lib.js";

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const num = (v) => (/^\d+(\.\d+)?$/.test(String(v ?? "").trim()) ? Number(v) : null);

// [description, check function (row) => violation message | null]
const RULES = [
  ...["Input", "Output"].flatMap((d) => [
    [`S/PDIF (Optical) ${d} ≤ Optical Ports (${d})`, (r) => {
      const s = num(r[`S/PDIF (Optical) ${d}`]), p = num(r[`Optical Ports (${d})`]);
      return s !== null && p !== null && s > p ? `S/PDIF (Optical) ${d}=${s} > Optical Ports=${p}` : null;
    }],
    [`ADAT ${d} (ch@48kHz) is a multiple of 8 and ≤ 8 × Optical Ports (${d})`, (r) => {
      const a = num(r[`ADAT ${d} (ch@48kHz)`]), p = num(r[`Optical Ports (${d})`]);
      if (a === null) return null;
      if (a % 8 !== 0) return `ADAT ${d}=${a} is not a multiple of 8`;
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
console.log(findings ? `\n${findings} candidate contradictions between columns (check them before verifying)` : "No contradictions between columns");
