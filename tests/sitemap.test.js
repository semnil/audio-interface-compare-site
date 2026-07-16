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

function extractUrls(sitemapContent) {
  const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
  return locMatches.map(m => m.replace(/<\/?loc>/g, ""));
}

describe("sitemap.xml の品質検証", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  test("sitemap.xml と products.json が読み込めること", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    assert.ok(urls.length > 0, "URL が 1 件も抽出できなかった");
  });

  test("URL 数が (index + 全製品ページ + ハブ) × (en + ja) と一致すること", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const brands = new Set(products.map(p => p.brand).filter(Boolean));
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    // en (ルート) と ja (/ja/) の 2 言語分
    const perLang = 1 + products.length + brands.size + categories.size;
    const expected = perLang * 2;
    const urls = extractUrls(sitemapContent);
    assert.equal(urls.length, expected,
      `URL 数が期待値と異なる: expected=${expected} (${perLang} paths × en/ja), actual=${urls.length}`);
  });

  test("日本語版 (/ja/) の URL が含まれること", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    assert.ok(urls.some(u => /\/ja\/$/.test(u)), "ja トップページ URL が無い");
    assert.ok(urls.some(u => u.includes("/ja/products/")), "ja 製品ページ URL が無い");
  });

  test("比較 URL (/compare/) が含まれないこと (フラグメント化でクロール対象外)", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    const compareUrls = urls.filter(u => u.includes("/compare/"));
    assert.equal(compareUrls.length, 0,
      `sitemap に比較 URL が残存: ${compareUrls.slice(0, 3).join(" / ")}`);
  });

  test("製品ページ・ハブページの URL が含まれること", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    assert.ok(urls.some(u => u.includes("/products/")), "製品ページ URL が無い");
    assert.ok(urls.some(u => u.includes("/brands/")), "ブランドハブ URL が無い");
    assert.ok(urls.some(u => u.includes("/categories/")), "カテゴリハブ URL が無い");
  });

  test("index URL (トップページ) が en / ja の 2 件含まれること", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    const indexUrls = urls.filter(u =>
      !u.includes("/compare/") && !u.includes("/products/") &&
      !u.includes("/brands/") && !u.includes("/categories/"));
    // en ルート (.../) と ja (.../ja/) の 2 件
    assert.equal(indexUrls.length, 2,
      `index URL の件数が期待値と異なる: ${JSON.stringify(indexUrls)}`);
  });

  test("重複 URL が存在しないこと", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    const unique = new Set(urls);
    assert.equal(unique.size, urls.length,
      `重複 URL が ${urls.length - unique.size} 件存在する`);
  });
});
