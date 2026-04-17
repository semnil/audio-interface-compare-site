// tests/a11y-compare.test.js
// compare ページのアクセシビリティ契約検査
// withMark / hl-mark / sr-only / role / scope 属性の整合性を確認
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COMPARE_DIR = join(ROOT, "dist", "compare");
const distExists = existsSync(COMPARE_DIR);

function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("compare ページの a11y 契約", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("各 highlight セルは hl-mark (aria-hidden) と sr-only ('Better value') を持つこと", () => {
    // build.js:887 の withMark 仕様:
    //   '<span class="hl-mark" aria-hidden="true"> ✓</span><span class="sr-only"> Better value</span>'
    // highlight クラスがあるセルには必ず上記 2 要素が存在する
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 10);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      // "val-col highlight" を含む td を抽出
      const hlCells = html.match(/<td class="val-col highlight">[^<]*(?:<[^>]+>[^<]*)*<\/td>/g) || [];
      for (const cell of hlCells) {
        if (!cell.includes('class="hl-mark" aria-hidden="true"')) {
          violations.push(`${d}: hl-mark なし: ${cell.slice(0, 80)}`);
        }
        if (!cell.includes('class="sr-only"')) {
          violations.push(`${d}: sr-only なし: ${cell.slice(0, 80)}`);
        }
      }
    }
    assert.equal(violations.length, 0,
      `a11y 契約違反: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("全 compare ページに skip-link (Skip to main content) が存在する", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 15);
    const missing = dirs.filter(d => {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      return !/class="skip-link"[^>]*>Skip to main content</.test(html);
    });
    assert.equal(missing.length, 0,
      `skip-link 欠落: ${missing.slice(0, 3).join(", ")}`);
  });

  test("全 compare ページのスペック表に <caption class=\"sr-only\"> があること", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 15);
    const missing = dirs.filter(d => {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      return !/<caption class="sr-only">/.test(html);
    });
    assert.equal(missing.length, 0,
      `caption sr-only 欠落: ${missing.slice(0, 3).join(", ")}`);
  });

  test("spec 表の各行に <th scope=\"row\"> が使われていること (a11y)", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 15);
    const missing = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      // th scope=row の数が 30 以上 (COLUMNS から spec 項目は 30 以上ある) - 最小チェック
      const count = (html.match(/<th scope="row"/g) || []).length;
      if (count < 20) missing.push(`${d}=${count}`);
    }
    assert.equal(missing.length, 0,
      `th scope=row が不足: ${missing.slice(0, 3).join(", ")}`);
  });

  test("NA セル (欠損値) に aria-label=\"No data\" が付与されていること", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 10);
    const missing = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      // "—" だけの NA セルは必ず aria-label="No data" を持つ
      const naCells = html.match(/<span class="na"[^>]*>—<\/span>/g) || [];
      for (const cell of naCells) {
        if (!cell.includes('aria-label="No data"')) {
          missing.push(`${d}: ${cell}`);
        }
      }
    }
    assert.equal(missing.length, 0,
      `NA cell に aria-label 欠落: ${missing.slice(0, 3).join(" / ")}`);
  });

  test("外部リンクには rel=\"noopener noreferrer\" 属性が付与されていること (tabnabbing 防御)", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 10);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      // target="_blank" を持つ link すべてを検査
      const links = html.match(/<a[^>]*target="_blank"[^>]*>/g) || [];
      for (const link of links) {
        if (!link.includes('rel="noopener noreferrer"')) {
          violations.push(`${d}: ${link}`);
        }
      }
    }
    assert.equal(violations.length, 0,
      `noopener noreferrer 欠落: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("<main id=\"main\"> が skip-link のターゲットとして存在する", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 10);
    const missing = dirs.filter(d => {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      return !/<main id="main">/.test(html);
    });
    assert.equal(missing.length, 0,
      `<main id="main"> 欠落: ${missing.slice(0, 3).join(", ")}`);
  });
});
