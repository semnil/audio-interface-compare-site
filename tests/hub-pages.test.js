// tests/hub-pages.test.js
// ブランド別 / カテゴリ別ハブページ (dist/brands, dist/categories) の検証
// dist/ が未生成の場合はスキップ
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

describe("hub-pages: ブランド / カテゴリ数の一致", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("ブランドハブ数が products.json の一意ブランド数と一致すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const brands = new Set(products.map(p => p.brand).filter(Boolean));
    const dirs = readdirSync(BRANDS_DIR).filter(d => existsSync(join(BRANDS_DIR, d, "index.html")));
    assert.equal(dirs.length, brands.size, `ブランドハブ ${dirs.length} ≠ 一意ブランド ${brands.size}`);
  });

  test("カテゴリハブ数が products.json の一意カテゴリ数と一致すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    const dirs = readdirSync(CATEGORIES_DIR).filter(d => existsSync(join(CATEGORIES_DIR, d, "index.html")));
    assert.equal(dirs.length, cats.size, `カテゴリハブ ${dirs.length} ≠ 一意カテゴリ ${cats.size}`);
  });
});

describe("hub-pages: SEO / 内部リンク契約", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  const sampleBrands = () => readdirSync(BRANDS_DIR).slice(0, 8);

  test("各ハブが製品ページへの静的 <a href> を含むこと (レンダリング非依存のクロール経路)", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      const links = (html.match(/href="[^"]*products\/[^"]+\/"/g) || []).length;
      if (links === 0) violations.push(`${d}: 製品リンク 0 件`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("canonical URL が /brands/{slug}/ 形式であること", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      const m = html.match(/rel="canonical" href="([^"]+)"/);
      if (!m) { violations.push(`${d}: canonical 欠落`); continue; }
      if (!m[1].includes(`/brands/${d}/`)) violations.push(`${d}: canonical パス不正 (${m[1]})`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("JSON-LD が @type:ItemList を含み、itemListElement が製品数と一致すること", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) { violations.push(`${d}: JSON-LD なし`); continue; }
      let ld;
      try { ld = JSON.parse(m[1]); } catch { violations.push(`${d}: JSON-LD parse 失敗`); continue; }
      if (ld["@type"] !== "ItemList") violations.push(`${d}: @type が ItemList でない`);
      const linkCount = (html.match(/href="[^"]*products\/[^"]+\/"/g) || []).length;
      if (!Array.isArray(ld.itemListElement) || ld.itemListElement.length !== linkCount) {
        violations.push(`${d}: itemListElement ${ld.itemListElement?.length} ≠ リンク数 ${linkCount}`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("meta description が存在すること", () => {
    const violations = [];
    for (const d of sampleBrands()) {
      const html = readFileSync(join(BRANDS_DIR, d, "index.html"), "utf8");
      if (!/<meta\s+name="description"\s+content="[^"]{10,}"/.test(html)) violations.push(d);
    }
    assert.equal(violations.length, 0, `meta description 欠落: ${violations.slice(0, 3).join(", ")}`);
  });
});

describe("hub-pages: index からの静的ブラウズ導線", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("index にブランドハブ / カテゴリハブへの静的リンクが存在すること", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const brandLinks = (html.match(/href="[^"]*brands\/[^"]+\/"/g) || []).length;
    const catLinks = (html.match(/href="[^"]*categories\/[^"]+\/"/g) || []).length;
    assert.ok(brandLinks > 0, "index にブランドハブへのリンクがない");
    assert.ok(catLinks > 0, "index にカテゴリハブへのリンクがない");
  });
});
