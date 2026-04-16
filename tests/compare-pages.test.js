// tests/compare-pages.test.js
// ビルド済み dist/compare/ から数件サンプリングして品質を検証するテスト
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

// dist/ が未生成の場合はテスト全体をスキップ
const distExists = existsSync(COMPARE_DIR) && existsSync(PRODUCTS_PATH);

// slug ペアから正規順ペアを返す (slug-a < slug-b)
function canonicalPair(slugA, slugB) {
  return slugA < slugB ? [slugA, slugB] : [slugB, slugA];
}

// ページ名 ("slugA-vs-slugB") からスラグペアを分解する
// slug 内に "-vs-" は含まれない前提 (slugify は英数字とハイフンのみ生成)
function parseDirName(dirName) {
  // 正規表現で最短マッチで "-vs-" を探す
  const idx = dirName.indexOf("-vs-");
  if (idx === -1) return null;
  return [dirName.slice(0, idx), dirName.slice(idx + 4)];
}

describe("compare ページの canonical/og:url 検証", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  let allDirs;
  let sampleDirs;

  test("compare/ 配下に少なくとも 1 件のページが存在すること", () => {
    allDirs = readdirSync(COMPARE_DIR);
    assert.ok(allDirs.length > 0, "compare/ 配下にディレクトリが存在しない");
  });

  test("逆順ページの canonical が正規順 URL を指すこと (10 件サンプリング)", () => {
    allDirs = readdirSync(COMPARE_DIR);

    // 逆順ページ (slug-a > slug-b) を抽出してサンプリング
    const reverseDirs = allDirs.filter(dir => {
      const pair = parseDirName(dir);
      if (!pair) return false;
      const [slugA, slugB] = pair;
      return slugA > slugB; // 逆順
    });

    assert.ok(reverseDirs.length > 0, "逆順ページが 1 件も存在しない");

    // 最大 10 件をサンプリング (均等にサンプリングするためステップを計算)
    const step = Math.max(1, Math.floor(reverseDirs.length / 10));
    const sample = reverseDirs.filter((_, i) => i % step === 0).slice(0, 10);

    const failures = [];
    for (const dirName of sample) {
      const pair = parseDirName(dirName);
      if (!pair) continue;
      const [slugA, slugB] = pair;
      const [canonA, canonB] = canonicalPair(slugA, slugB);

      const htmlPath = join(COMPARE_DIR, dirName, "index.html");
      const html = readFileSync(htmlPath, "utf8");

      // canonical URL の抽出
      const canonicalMatch = html.match(/rel="canonical"\s+href="([^"]+)"/);
      if (!canonicalMatch) {
        failures.push(`${dirName}: canonical タグが見つからない`);
        continue;
      }
      const canonicalHref = canonicalMatch[1];

      // 正規順 URL が canonical href に含まれているか確認
      const expectedSlugPart = `${canonA}-vs-${canonB}`;
      if (!canonicalHref.includes(expectedSlugPart)) {
        failures.push(`${dirName}: canonical が正規順を指していない。expected contains="${expectedSlugPart}", actual="${canonicalHref}"`);
      }
    }

    assert.equal(failures.length, 0,
      `canonical 不正のページが ${failures.length} 件検出された:\n${failures.join("\n")}`);
  });

  test("og:url が canonical href と一致すること (10 件サンプリング)", () => {
    allDirs = readdirSync(COMPARE_DIR);

    // ページ総数の均等サンプリング (正規順・逆順混在)
    const step = Math.max(1, Math.floor(allDirs.length / 10));
    const sample = allDirs.filter((_, i) => i % step === 0).slice(0, 10);

    const failures = [];
    for (const dirName of sample) {
      const htmlPath = join(COMPARE_DIR, dirName, "index.html");
      const html = readFileSync(htmlPath, "utf8");

      // canonical URL の抽出
      const canonicalMatch = html.match(/rel="canonical"\s+href="([^"]+)"/);
      if (!canonicalMatch) {
        failures.push(`${dirName}: canonical タグが見つからない`);
        continue;
      }
      const canonicalHref = canonicalMatch[1];

      // og:url の抽出
      const ogUrlMatch = html.match(/property="og:url"\s+content="([^"]+)"/);
      if (!ogUrlMatch) {
        failures.push(`${dirName}: og:url タグが見つからない`);
        continue;
      }
      const ogUrl = ogUrlMatch[1];

      if (canonicalHref !== ogUrl) {
        failures.push(`${dirName}: canonical="${canonicalHref}" と og:url="${ogUrl}" が一致しない`);
      }
    }

    assert.equal(failures.length, 0,
      `canonical/og:url 不一致のページが ${failures.length} 件検出された:\n${failures.join("\n")}`);
  });

  test("正規順ページの canonical が自己参照であること (10 件サンプリング)", () => {
    allDirs = readdirSync(COMPARE_DIR);

    // 正規順ページ (slug-a <= slug-b) を抽出してサンプリング
    const canonDirs = allDirs.filter(dir => {
      const pair = parseDirName(dir);
      if (!pair) return false;
      const [slugA, slugB] = pair;
      return slugA <= slugB; // 正規順
    });

    assert.ok(canonDirs.length > 0, "正規順ページが 1 件も存在しない");

    const step = Math.max(1, Math.floor(canonDirs.length / 10));
    const sample = canonDirs.filter((_, i) => i % step === 0).slice(0, 10);

    const failures = [];
    for (const dirName of sample) {
      const htmlPath = join(COMPARE_DIR, dirName, "index.html");
      const html = readFileSync(htmlPath, "utf8");

      const canonicalMatch = html.match(/rel="canonical"\s+href="([^"]+)"/);
      if (!canonicalMatch) {
        failures.push(`${dirName}: canonical タグが見つからない`);
        continue;
      }
      const canonicalHref = canonicalMatch[1];

      // 自己参照なら canonical に自分の dirName が含まれるはず
      if (!canonicalHref.includes(dirName)) {
        failures.push(`${dirName}: 正規順なのに canonical が自己参照でない。href="${canonicalHref}"`);
      }
    }

    assert.equal(failures.length, 0,
      `canonical が自己参照でないページが ${failures.length} 件検出された:\n${failures.join("\n")}`);
  });

  test("全ページに og:title が存在すること (10 件サンプリング)", () => {
    allDirs = readdirSync(COMPARE_DIR);
    const step = Math.max(1, Math.floor(allDirs.length / 10));
    const sample = allDirs.filter((_, i) => i % step === 0).slice(0, 10);

    const failures = [];
    for (const dirName of sample) {
      const htmlPath = join(COMPARE_DIR, dirName, "index.html");
      const html = readFileSync(htmlPath, "utf8");
      if (!html.includes('property="og:title"')) {
        failures.push(`${dirName}: og:title が存在しない`);
      }
    }

    assert.equal(failures.length, 0,
      `og:title がないページが ${failures.length} 件検出された:\n${failures.join("\n")}`);
  });
});
