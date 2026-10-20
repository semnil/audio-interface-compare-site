// tests/sitemap.test.js
// Quality tests for the built dist/sitemap.xml
// Skipped when dist/ does not exist
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITEMAP_PATH = join(ROOT, "dist", "sitemap.xml");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");

// Skip all tests when dist/ has not been built
const distExists = existsSync(SITEMAP_PATH) && existsSync(PRODUCTS_PATH);

function extractUrls(sitemapContent) {
  const locMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || [];
  return locMatches.map(m => m.replace(/<\/?loc>/g, ""));
}

describe("sitemap.xml quality", { skip: !distExists ? "dist/ not built. Run npm run build" : false }, () => {
  test("sitemap.xml and products.json can be read", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    assert.ok(urls.length > 0, "not a single URL could be extracted");
  });

  test("URL count equals (index + all product pages + hubs) x (en + ja)", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const brands = new Set(products.map(p => p.brand).filter(Boolean));
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    // Two languages: en (root) and ja (/ja/)
    const perLang = 1 + products.length + brands.size + categories.size;
    const expected = perLang * 2;
    const urls = extractUrls(sitemapContent);
    assert.equal(urls.length, expected,
      `URL count differs from the expected value: expected=${expected} (${perLang} paths x en/ja), actual=${urls.length}`);
  });

  test("URLs of the Japanese version (/ja/) are included", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    assert.ok(urls.some(u => /\/ja\/$/.test(u)), "no ja top page URL");
    assert.ok(urls.some(u => u.includes("/ja/products/")), "no ja product page URL");
  });

  test("comparison URLs (/compare/) are not included (not crawl targets since moving to fragments)", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    const compareUrls = urls.filter(u => u.includes("/compare/"));
    assert.equal(compareUrls.length, 0,
      `comparison URLs remain in the sitemap: ${compareUrls.slice(0, 3).join(" / ")}`);
  });

  test("product page and hub page URLs are included", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    assert.ok(urls.some(u => u.includes("/products/")), "no product page URL");
    assert.ok(urls.some(u => u.includes("/brands/")), "no brand hub URL");
    assert.ok(urls.some(u => u.includes("/categories/")), "no category hub URL");
  });

  test("the index URL (top page) is included twice, for en / ja", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    const indexUrls = urls.filter(u =>
      !u.includes("/compare/") && !u.includes("/products/") &&
      !u.includes("/brands/") && !u.includes("/categories/"));
    // Two: the en root (.../) and ja (.../ja/)
    assert.equal(indexUrls.length, 2,
      `index URL count differs from the expected value: ${JSON.stringify(indexUrls)}`);
  });

  test("there are no duplicate URLs", () => {
    const sitemapContent = readFileSync(SITEMAP_PATH, "utf8");
    const urls = extractUrls(sitemapContent);
    const unique = new Set(urls);
    assert.equal(unique.size, urls.length,
      `${urls.length - unique.size} duplicate URLs exist`);
  });
});
