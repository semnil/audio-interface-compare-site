// tests/sitemap.test.js
// ビルド済み dist/sitemap.xml の品質検証テスト
// dist/ が存在しない場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITEMAP_PATH = join(ROOT, "dist", "sitemap.xml");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");

// dist/ が未生成の場合はテスト全体をスキップ
const distExists = existsSync(SITEMAP_PATH) && existsSync(PRODUCTS_PATH);

describe("sitemap.xml の品質検証", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  let sitemapContent;
  let urls;
  let n; // 製品数

  // 各テスト前に一度だけ読み込む
  test("sitemap.xml と products.json が読み込めること", () => {
    sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    n = products.length;

    // <loc> タグから全 URL を抽出
    const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
    urls = locMatches.map(m => m.replace(/<\/?loc>/g, ""));
    assert.ok(urls.length > 0, "URL が 1 件も抽出できなかった");
  });

  test("URL 数が C(n,2)+1 (比較ページ + index) と一致すること", () => {
    // products.json が読み込まれていることが前提
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    n = products.length;
    const expected = n * (n - 1) / 2 + 1;
    const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
    urls = locMatches.map(m => m.replace(/<\/?loc>/g, ""));
    assert.equal(urls.length, expected,
      `URL 数が期待値と異なる: expected=${expected}, actual=${urls.length}`);
  });

  test("全比較ページ URL が正規順 (slug-a < slug-b) であること", () => {
    const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
    urls = locMatches.map(m => m.replace(/<\/?loc>/g, ""));

    // /compare/ を含む URL のみ検証
    const compareUrls = urls.filter(u => u.includes("/compare/"));
    assert.ok(compareUrls.length > 0, "比較ページ URL が 1 件も見つからなかった");

    const violations = [];
    for (const url of compareUrls) {
      // URL から slug ペアを抽出: .../compare/{slugA}-vs-{slugB}/
      const match = url.match(/\/compare\/(.+)-vs-(.+)\/$/);
      if (!match) {
        violations.push(`URL パターン不一致: ${url}`);
        continue;
      }
      const [, slugA, slugB] = match;

      // -vs- で分割すると slugA に "xxx-vs" が含まれる場合があるため
      // より確実な方法として "A-vs-B" 全体から最小 slugA を特定する
      // ただし slug 内に "-vs-" は含まれない (英数字とハイフンのみ) ので上記で十分
      if (slugA > slugB) {
        violations.push(`逆順 URL: ${url} (${slugA} > ${slugB})`);
      }
    }

    assert.equal(violations.length, 0,
      `正規順でない URL が ${violations.length} 件検出された:\n${violations.slice(0, 5).join("\n")}`);
  });

  test("index URL (トップページ) が 1 件含まれること", () => {
    const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
    urls = locMatches.map(m => m.replace(/<\/?loc>/g, ""));
    const indexUrls = urls.filter(u => !u.includes("/compare/"));
    assert.equal(indexUrls.length, 1,
      `index URL の件数が期待値と異なる: ${JSON.stringify(indexUrls)}`);
  });

  test("重複 URL が存在しないこと", () => {
    const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
    urls = locMatches.map(m => m.replace(/<\/?loc>/g, ""));
    const unique = new Set(urls);
    assert.equal(unique.size, urls.length,
      `重複 URL が ${urls.length - unique.size} 件存在する`);
  });
});
