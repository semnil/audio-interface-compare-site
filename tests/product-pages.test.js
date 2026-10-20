// tests/product-pages.test.js
// Checks quality, a11y, and SEO of the built dist/products/{slug}/index.html
// Skipped when dist/ has not been built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const PRODUCTS_DIR = join(ROOT, "dist", "products");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(PRODUCTS_DIR) && existsSync(PRODUCTS_PATH);

function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("product-pages: file existence", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("an index.html is generated for every product", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const missing = products.filter(p => !existsSync(join(PRODUCTS_DIR, p.slug, "index.html")));
    assert.equal(missing.length, 0,
      `missing files: ${missing.slice(0, 5).map(p => p.slug).join(", ")}`);
  });

  test("the number of generated product pages matches the products.json count", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const dirs = readdirSync(PRODUCTS_DIR).filter(d =>
      existsSync(join(PRODUCTS_DIR, d, "index.html"))
    );
    assert.equal(dirs.length, products.length,
      `page count ${dirs.length} != products.json count ${products.length}`);
  });
});

describe("product-pages: SEO contract", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("<title> contains the product name and 'Specs'", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<title>([^<]+)<\/title>/);
      if (!m) { violations.push(`${p.slug}: no title tag`); continue; }
      if (!m[1].includes("Specs")) violations.push(`${p.slug}: 'Specs' not in title (${m[1]})`);
      if (!m[1].includes(escapeHtml(p.brand))) violations.push(`${p.slug}: brand name not in title`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("<h1> contains the product name and 'Specs'", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<h1>([^<]+)<\/h1>/);
      if (!m) { violations.push(`${p.slug}: no h1 tag`); continue; }
      if (!m[1].includes(escapeHtml(p.brand))) violations.push(`${p.slug}: brand name not in h1`);
      if (!m[1].includes("Specs")) violations.push(`${p.slug}: 'Specs' not in h1`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("canonical URL has the /products/{slug}/ form", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/rel="canonical"\s+href="([^"]+)"/);
      if (!m) { violations.push(`${p.slug}: canonical missing`); continue; }
      if (!m[1].includes(`/products/${p.slug}/`)) {
        violations.push(`${p.slug}: invalid canonical path (${m[1]})`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("meta description exists", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/<meta\s+name="description"\s+content="[^"]{10,}"/.test(html);
    });
    assert.equal(missing.length, 0,
      `meta description missing or too short: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("JSON-LD contains @type:Product", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
      if (!m) { violations.push(`${p.slug}: no JSON-LD`); continue; }
      let ld;
      try { ld = JSON.parse(m[1]); } catch { violations.push(`${p.slug}: JSON-LD parse failed`); continue; }
      if (ld["@type"] !== "Product") violations.push(`${p.slug}: @type is not Product (${ld["@type"]})`);
      if (!ld.name || !ld.name.includes(p.brand)) violations.push(`${p.slug}: no brand in JSON-LD name`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("all OGP tags are present (og:type, og:title, og:description, og:url)", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const required = [
      'property="og:type"', 'property="og:title"',
      'property="og:description"', 'property="og:url"',
    ];
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      for (const tag of required) {
        if (!html.includes(tag)) violations.push(`${p.slug}: ${tag} missing`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 5).join(" / "));
  });

  test("comparison links (.compare-links) exist and contain fragment URLs (#a=..&b=..)", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      if (!html.includes('class="compare-links"')) {
        violations.push(`${p.slug}: compare-links missing`);
        continue;
      }
      // Moved to fragment URLs. Static /compare/ URLs are not linked (prevents a crawl explosion)
      // Inside HTML attributes, & is escaped to &amp;
      const fragCount = (html.match(/href="[^"]*#a=[^"]*(?:&amp;|&)b=[^"]*"/g) || []).length;
      if (fragCount === 0) violations.push(`${p.slug}: 0 fragment comparison links`);
      if (html.includes("/compare/")) violations.push(`${p.slug}: static /compare/ URL remains`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("spec summary sentence (.product-summary) exists and contains the product name", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<p class="product-summary"[^>]*>([^<]+)<\/p>/);
      if (!m) { violations.push(`${p.slug}: product-summary missing`); continue; }
      if (!m[1].includes(escapeHtml(p.brand))) violations.push(`${p.slug}: no brand name in summary`);
      if (m[1].length < 30) violations.push(`${p.slug}: summary too short (${m[1].length})`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });
});

describe("product-pages: a11y contract", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("skip-link exists", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/class="skip-link"[^>]*>Skip to main content</.test(html);
    });
    assert.equal(missing.length, 0,
      `skip-link missing: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("<main id=\"main\"> exists", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/<main id="main">/.test(html);
    });
    assert.equal(missing.length, 0,
      `<main id="main"> missing: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("spec table has <caption class=\"sr-only\">", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/<caption class="sr-only">/.test(html);
    });
    assert.equal(missing.length, 0,
      `caption sr-only missing: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("each spec table row uses <th scope=\"row\">", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const count = (html.match(/<th scope="row"/g) || []).length;
      if (count < 20) violations.push(`${p.slug}: only ${count} th[scope=row]`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("external links have rel=\"noopener noreferrer\"", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const links = html.match(/<a[^>]*target="_blank"[^>]*>/g) || [];
      for (const link of links) {
        if (!link.includes('rel="noopener noreferrer"')) {
          violations.push(`${p.slug}: ${link.slice(0, 80)}`);
        }
      }
    }
    assert.equal(violations.length, 0,
      `noopener noreferrer missing: ${violations.slice(0, 3).join(" / ")}`);
  });
});
