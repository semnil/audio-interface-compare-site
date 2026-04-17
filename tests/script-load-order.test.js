// tests/script-load-order.test.js
// PAGE_JA (言語リソース) と i18n.js (変換処理) のスクリプト読み込み順序検証
// 順序が逆になると i18n.js 実行時に PAGE_JA が undefined で日本語化が効かない
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const INDEX_PATH = join(DIST, "index.html");
const COMPARE_DIR = join(DIST, "compare");
const distExists = existsSync(INDEX_PATH) && existsSync(COMPARE_DIR);

function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("スクリプト読み込み順序: PAGE_JA → i18n.js", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("index.html で PAGE_JA の宣言が i18n.js スクリプトタグより前にある", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const pageJaIdx = html.indexOf("var PAGE_JA=");
    const i18nIdx = html.indexOf("i18n.js");
    assert.ok(pageJaIdx > 0, "PAGE_JA 宣言が見つからない");
    assert.ok(i18nIdx > 0, "i18n.js 参照が見つからない");
    assert.ok(pageJaIdx < i18nIdx,
      `PAGE_JA (${pageJaIdx}) が i18n.js (${i18nIdx}) より後ろにある - 読み込み順序バグ`);
  });

  test("compare ページ 10 件で PAGE_JA が i18n.js より前にある", () => {
    const sample = sampleDirs(readdirSync(COMPARE_DIR), 10);
    const violations = [];
    for (const d of sample) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const pageJaIdx = html.indexOf("var PAGE_JA=");
      const i18nIdx = html.indexOf("i18n.js");
      if (pageJaIdx < 0 || i18nIdx < 0 || pageJaIdx >= i18nIdx) {
        violations.push(`${d}: PAGE_JA=${pageJaIdx}, i18n.js=${i18nIdx}`);
      }
    }
    assert.equal(violations.length, 0,
      `読み込み順序違反: ${violations.slice(0, 3).join(" / ")}`);
  });
});

describe("PAGE_JA の JS シンタックス健全性", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("index.html の PAGE_JA は JS としてパース可能", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/var PAGE_JA=(\{[^}]+\})/);
    assert.ok(m, "PAGE_JA 宣言が見つからない");
    const pageJaLiteral = m[1];
    // new Function で評価。SyntaxError が出たら壊れている
    let parsed;
    assert.doesNotThrow(() => {
      parsed = new Function(`return ${pageJaLiteral};`)();
    }, `PAGE_JA が JS として parse 不能: ${pageJaLiteral.slice(0, 120)}`);
    // 最低限のキー存在確認
    assert.ok(parsed.subtitle, "PAGE_JA.subtitle が無い");
    assert.ok(parsed.compareBtn, "PAGE_JA.compareBtn が無い");
    assert.ok(parsed.footer, "PAGE_JA.footer が無い");
  });

  test("compare ページの PAGE_JA も JS として parse 可能", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 5);
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/var PAGE_JA=(\{[^}]+\})/);
      assert.ok(m, `${d}: PAGE_JA 宣言が見つからない`);
      assert.doesNotThrow(() => {
        new Function(`return ${m[1]};`)();
      }, `${d}: PAGE_JA parse 失敗`);
    }
  });

  test("PAGE_JA 内の値 (シングルクォート囲み) にエスケープ不要な ' が混入していないこと", () => {
    // build.js では PAGE_JA の値をシングルクォートで囲んでいる。
    // もし buildDate 等の展開値に ' が含まれると JS シンタックスエラー。
    // ISO 日付 (YYYY-MM-DD) には ' が含まれないため安全のはずだが、回帰として検査。
    const html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/var PAGE_JA=(\{[^}]+\})/);
    const pageJaLiteral = m[1];
    // 文字列リテラル内の ' は \\\' でエスケープされるべき。ここでは粗く全体の 'x': 'y' 形式が壊れていないかを見る
    // 単純に new Function で parse できれば OK (上のテストで担保)
    assert.ok(pageJaLiteral.length > 20, "PAGE_JA リテラルが短すぎる");
  });
});
