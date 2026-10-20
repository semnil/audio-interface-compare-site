// tests/hub-pages.test.js
// Checks for the per-brand / per-category hub pages (dist/brands, dist/categories)
// Skipped when dist/ is not built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BRANDS_DIR = join(ROOT, "dist", "brands");
const CATEGORIES_DIR = join(ROOT, "dist", "categories");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(BRANDS_DIR) && existsSync(CATEGORIES_DIR) && existsSync(PRODUCTS_PATH);

describe("hub-pages: brand / category counts match", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the number of brand hubs matches the number of unique brands in products.json", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const brands = new Set(products.map(p => p.brand).filter(Boolean));
    const dirs = readdirSync(BRANDS_DIR).filter(d => existsSync(join(BRANDS_DIR, d, "index.html")));
    assert.equal(dirs.length, brands.size, `brand hubs ${dirs.length} != unique brands ${brands.size}`);
  });

  test("the number of category hubs matches the number of unique categories in products.json", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    const dirs = readdirSync(CATEGORIES_DIR).filter(d => existsSync(join(CATEGORIES_DIR, d, "index.html")));
    assert.equal(dirs.length, cats.size, `category hubs ${dirs.length} != unique categories ${cats.size}`);
  });
});

describe("hub-pages: SEO / internal link contract", { skip: !distExists ? "dist/ not built" : false }, () => {
  const sampleBrands = () => readdirSync(BRANDS_DIR).slice(0, 8);

  test("each hub contains static <a href> links to product pages (a crawl path that does not depend on rendering)", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      const links = (html.match(/href="[^"]*products\/[^"]+\/"/g) || []).length;
      if (links === 0) violations.push(`${d}: 0 product links`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("the canonical URL has the form /brands/{slug}/", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      const m = html.match(/rel="canonical" href="([^"]+)"/);
      if (!m) { violations.push(`${d}: canonical is missing`); continue; }
      if (!m[1].includes(`/brands/${d}/`)) violations.push(`${d}: invalid canonical path (${m[1]})`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("the JSON-LD contains @type:ItemList, and itemListElement matches the number of product links on the page", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) { violations.push(`${d}: no JSON-LD`); continue; }
      let ld;
      try { ld = JSON.parse(m[1]); } catch { violations.push(`${d}: JSON-LD parse failed`); continue; }
      if (ld["@type"] !== "ItemList") violations.push(`${d}: @type is not ItemList`);
      const linkCount = (html.match(/href="[^"]*products\/[^"]+\/"/g) || []).length;
      if (!Array.isArray(ld.itemListElement) || ld.itemListElement.length !== linkCount) {
        violations.push(`${d}: itemListElement ${ld.itemListElement?.length} != link count ${linkCount}`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("a meta description exists", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      if (!/<meta\s+name="description"\s+content="[^"]{10,}"/.test(html)) violations.push(d);
    }
    assert.equal(violations.length, 0, `meta description is missing: ${violations.slice(0, 3).join(", ")}`);
  });
});

describe("hub-pages: static browse paths from the index", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the index has static links to the brand hubs / category hubs", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const brandLinks = (html.match(/href="[^"]*brands\/[^"]+\/"/g) || []).length;
    const catLinks = (html.match(/href="[^"]*categories\/[^"]+\/"/g) || []).length;
    assert.ok(brandLinks > 0, "no links to brand hubs in index");
    assert.ok(catLinks > 0, "no links to category hubs in index");
  });
});
