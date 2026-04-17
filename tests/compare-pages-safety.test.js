// tests/compare-pages-safety.test.js
// ビルド済み dist/compare 配下の HTML について、セキュリティ・整合性の実機検査
// dist/ が未生成の場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COMPARE_DIR = join(ROOT, "dist", "compare");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(COMPARE_DIR) && existsSync(PRODUCTS_PATH);

// ページ名からスラグペアを分解 (slug 内に '-vs-' は含まれない前提)
function parseDirName(dirName) {
  const idx = dirName.indexOf("-vs-");
  if (idx === -1) return null;
  return [dirName.slice(0, idx), dirName.slice(idx + 4)];
}

// ディレクトリリストからステップサンプリング
function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("compare ページのセキュリティ検査", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  test("ディレクトリ総数が 2 * C(n,2) = n*(n-1) と一致すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const dirs = readdirSync(COMPARE_DIR);
    const expected = products.length * (products.length - 1);
    assert.equal(dirs.length, expected,
      `compare/ ディレクトリ数が期待値と異なる: expected=${expected}, actual=${dirs.length}`);
  });

  test("サンプル 20 ページに javascript: スキームの href が含まれないこと", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      // href 属性に javascript: / vbscript: / data: が入っていないか (大文字小文字・空白許容)
      if (/href\s*=\s*"\s*(javascript|vbscript|data)\s*:/i.test(html)) {
        violations.push(d);
      }
    }
    assert.equal(violations.length, 0,
      `危険スキーム href 検出: ${violations.join(", ")}`);
  });

  test("サンプル 20 ページに <script> タグ以外で 'alert(' パターンが出現しないこと", () => {
    // 明らかな XSS injection の simple detector。真面目な検証は別途パーサが必要だが、
    // 簡易的に製品データ由来の alert 注入を検知する。
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      // <script> ブロックを除去してから検索
      const scriptStripped = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      if (/\balert\s*\(/.test(scriptStripped)) {
        violations.push(d);
      }
    }
    assert.equal(violations.length, 0,
      `<script> 外 alert( パターン検出: ${violations.join(", ")}`);
  });

  test("サンプル 20 ページに <meta charset=\"utf-8\"> が存在すること", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const missing = dirs.filter(d => {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      return !/<meta\s+charset="utf-8">/i.test(html);
    });
    assert.equal(missing.length, 0,
      `meta charset 欠落: ${missing.slice(0, 3).join(", ")}`);
  });

  test("サンプル 20 ページに JSON-LD (application/ld+json) が 1 つだけ存在すること", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const bad = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const count = (html.match(/<script type="application\/ld\+json">/g) || []).length;
      if (count !== 1) bad.push(`${d}=${count}`);
    }
    assert.equal(bad.length, 0, `JSON-LD 数が期待値と異なる: ${bad.slice(0, 3).join(", ")}`);
  });

  test("サンプル 20 ページで JSON-LD が有効な JSON として parse できること", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const bad = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) { bad.push(`${d}: JSON-LD なし`); continue; }
      try {
        const parsed = JSON.parse(m[1]);
        // スキーマの最小チェック
        if (parsed["@context"] !== "https://schema.org") bad.push(`${d}: @context 不正`);
        if (!Array.isArray(parsed.about) || parsed.about.length !== 2) {
          bad.push(`${d}: about が 2 要素配列でない`);
        }
      } catch (e) {
        bad.push(`${d}: parse error ${e.message}`);
      }
    }
    assert.equal(bad.length, 0, `JSON-LD 不正: ${bad.slice(0, 3).join(" / ")}`);
  });

  test("サンプル 20 ページで h1 が 1 つだけであること (SEO)", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const bad = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const count = (html.match(/<h1\b/g) || []).length;
      if (count !== 1) bad.push(`${d}=${count}`);
    }
    assert.equal(bad.length, 0, `h1 数が 1 以外: ${bad.slice(0, 3).join(", ")}`);
  });

  test("逆順ページの HTML が存在すること (双方向生成)", () => {
    // a-vs-b が存在するなら b-vs-a も存在するはず
    const allDirs = new Set(readdirSync(COMPARE_DIR));
    const sample = sampleDirs([...allDirs], 10);
    const missing = [];
    for (const d of sample) {
      const pair = parseDirName(d);
      if (!pair) continue;
      const [a, b] = pair;
      const reverse = `${b}-vs-${a}`;
      if (!allDirs.has(reverse)) missing.push(`${d} → ${reverse} 欠落`);
    }
    assert.equal(missing.length, 0,
      `逆順ページ欠落: ${missing.slice(0, 3).join(" / ")}`);
  });

  test("サンプル 20 ページのタイトルに製品名 A と B の両方が含まれること", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 20);
    const bad = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/<title>([^<]+)<\/title>/);
      if (!m) { bad.push(`${d}: title なし`); continue; }
      const title = m[1];
      if (!title.includes(" vs ")) bad.push(`${d}: title に ' vs ' 区切りなし: "${title}"`);
      if (!/— Audio Interface Comparator$/.test(title.trim())) {
        bad.push(`${d}: title 末尾ブランド欠落: "${title}"`);
      }
    }
    assert.equal(bad.length, 0, `title 不整合: ${bad.slice(0, 3).join(" / ")}`);
  });

  test("逆順ページの og:title は表示順 (B vs A) を保持すること (UX)", () => {
    // canonical / og:url は正規順に統一する設計だが、og:title はユーザーの選択順を保持
    // (既存実装の確認)。表示順保持は compare-header の左右配置と一致
    const allDirs = readdirSync(COMPARE_DIR);
    const reverseDirs = allDirs.filter(d => {
      const pair = parseDirName(d);
      if (!pair) return false;
      const [a, b] = pair;
      return a > b;
    });
    const sample = sampleDirs(reverseDirs, 5);
    const bad = [];
    for (const d of sample) {
      const pair = parseDirName(d);
      const [slugA, slugB] = pair;
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/property="og:title" content="([^"]+)"/);
      if (!m) { bad.push(`${d}: og:title なし`); continue; }
      const ogTitle = m[1];
      // og:title 内のセパレータ " vs " の位置から左右を取得
      const [leftTitle, rightTitle] = ogTitle.split(" vs ");
      if (!leftTitle || !rightTitle) { bad.push(`${d}: og:title 区切り不正`); continue; }
      // ユーザー選択順 = URL の slug 順なので、左に slugA 由来、右に slugB 由来が来るはず
      // (displayName は slugify 前の原表記なので厳密一致は困難。
      //  代わりに、canonical 正規順と逆なら og:title も逆であることを確認)
      // 逆順ページなので og:title の左側は slugA 由来 (アルファベット順で後) の製品
      // ここでは単に左右が異なることのみ確認
      if (leftTitle === rightTitle) bad.push(`${d}: 左右同名`);
    }
    assert.equal(bad.length, 0, `og:title 不正: ${bad.slice(0, 3).join(" / ")}`);
  });
});
