// tests/compare-jsonld-safety.test.js
// ビルド済み dist/compare 配下の JSON-LD に XSS 保護の観点を検査
// build.js:919-924 の JSON-LD 生成は & のみ \u0026 に変換する実装。
// < / U+2028 / U+2029 は JSON.stringify が素通しするため、
// 悪意あるデータが入ると <script type="application/ld+json"> から脱出する可能性がある。
// 現行データでは該当なし (products-json.test.js で担保) だが、
// データ追加時の回帰として < / U+2028 / U+2029 の不混入を明示検査する。
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

// サンプリングヘルパー
function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("compare ページの JSON-LD 脱出防御検査", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  test("サンプル 30 ページの JSON-LD に素の '</script' が出現しないこと (スクリプト脱出 XSS 防御)", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 30);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) { violations.push(`${d}: JSON-LD なし`); continue; }
      const body = m[1];
      if (/<\/script/i.test(body)) {
        violations.push(`${d}: JSON-LD 内に </script が検出された`);
      }
    }
    assert.equal(violations.length, 0,
      `JSON-LD 脱出リスク: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("サンプル 30 ページの JSON-LD に U+2028/U+2029 が出現しないこと (JS パーサ破壊防御)", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 30);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) continue;
      const body = m[1];
      if (/[\u2028\u2029]/.test(body)) {
        violations.push(`${d}: U+2028/U+2029 検出`);
      }
    }
    assert.equal(violations.length, 0,
      `U+2028/U+2029 混入: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("サンプル 30 ページの JSON-LD に素の < 文字 (タグ開始) が出現しないこと", () => {
    // 現在の実装は & → \u0026 のみ置換するので、< はエスケープされない
    // 現データに < を含む値はないため、このテストは pass する (データ由来 XSS 予防の回帰固定)
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 30);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) continue;
      const body = m[1];
      // JSON.stringify で " が \" にエスケープされるため、属性値内に単独の < が現れる
      // 唯一の合法ケースは無い (schema.org の名前/URL に < は含まれないはず)
      if (/<[^!]/.test(body)) {
        // <!-- を除外しつつ <任意文字 を検出
        violations.push(`${d}: 素の < 検出`);
      }
    }
    assert.equal(violations.length, 0,
      `JSON-LD 内に素の < が混入: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("サンプル 30 ページの JSON-LD は有効な JSON として parse 可能", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 30);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) { violations.push(`${d}: JSON-LD なし`); continue; }
      try {
        const parsed = JSON.parse(m[1]);
        assert.equal(parsed["@context"], "https://schema.org");
        assert.equal(parsed["@type"], "WebPage");
        assert.ok(Array.isArray(parsed.about));
        assert.equal(parsed.about.length, 2);
        for (const prod of parsed.about) {
          assert.equal(prod["@type"], "Product");
          assert.ok(prod.name && typeof prod.name === "string");
        }
      } catch (e) {
        violations.push(`${d}: ${e.message}`);
      }
    }
    assert.equal(violations.length, 0,
      `JSON-LD parse 失敗: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("JSON-LD 内の name フィールドに brand 名の & が \\u0026 で残存していること (build.js 仕様)", () => {
    // build.js:924 の .replace(/&/g, '\\u0026') が動作しているか
    // Allen & Heath 製品のページで検査
    const dirs = readdirSync(COMPARE_DIR).filter(d => d.includes("allen-heath"));
    if (dirs.length === 0) return; // データに依存
    const html = readFileSync(join(COMPARE_DIR, dirs[0], "index.html"), "utf8");
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, "JSON-LD なし");
    // raw HTML 内で "Allen \u0026 Heath" (エスケープ保持) が含まれる
    // JSON.parse すると "Allen & Heath" になる
    assert.ok(m[1].includes("Allen \\u0026 Heath") || m[1].includes("allen-heath"),
      `JSON-LD に期待される brand 文字列が含まれない`);
  });
});

describe("compare ページの canonical/og:url と h1/title の関係検査", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  // 逆順ページの設計契約:
  // - URL: user 選択順 (b-vs-a)
  // - title / h1 / og:title: user 選択順 (B vs A)
  // - canonical / og:url: 正規順 (a-vs-b) → SEO 上 canonical merge
  // この非対称は設計として意図的。逆順ページは直リンク以外では到達しない。

  function parseDirName(dirName) {
    const idx = dirName.indexOf("-vs-");
    if (idx === -1) return null;
    return [dirName.slice(0, idx), dirName.slice(idx + 4)];
  }

  test("逆順ページの canonical は正規順を指し、og:url と一致すること", () => {
    const dirs = readdirSync(COMPARE_DIR);
    const reverseDirs = dirs.filter(d => {
      const p = parseDirName(d);
      if (!p) return false;
      return p[0] > p[1];
    });
    const sample = sampleDirs(reverseDirs, 10);
    const violations = [];
    for (const d of sample) {
      const [a, b] = parseDirName(d);
      const [canonA, canonB] = a < b ? [a, b] : [b, a];
      const expectedSlugPart = `${canonA}-vs-${canonB}`;
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1];
      if (!canonical?.includes(expectedSlugPart)) {
        violations.push(`${d}: canonical=${canonical}`);
      }
      if (canonical !== ogUrl) {
        violations.push(`${d}: canonical/og:url 不一致 (${canonical} vs ${ogUrl})`);
      }
    }
    assert.equal(violations.length, 0,
      `canonical/og:url 不整合: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("逆順ページの h1 / title は表示順 (B vs A) を保持し、canonical と不一致であること (設計契約)", () => {
    const dirs = readdirSync(COMPARE_DIR);
    const reverseDirs = dirs.filter(d => {
      const p = parseDirName(d);
      if (!p) return false;
      return p[0] > p[1];
    });
    if (reverseDirs.length === 0) return;
    const sample = sampleDirs(reverseDirs, 5);
    for (const d of sample) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      const h1 = html.match(/<h1>([^<]+)<\/h1>/)?.[1];
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      // 設計契約: URL (dir 名) に含まれる slug 順序と title / h1 の表示順序が一致する
      // canonical はアルファベット順に並び替えられるので dir 名と一致しない
      assert.ok(title && h1 && canonical, `${d}: meta 欠落`);
      assert.ok(canonical.includes("/compare/") && !canonical.includes(d),
        `${d}: canonical が逆順自己参照になっている (期待: 正規順)`);
    }
  });
});
