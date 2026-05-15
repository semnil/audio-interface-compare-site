// tests/product-pages.test.js
// ビルド済み dist/products/{slug}/index.html の品質・a11y・SEO 検証
// dist/ が未生成の場合はスキップ
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

describe("product-pages: ファイル存在確認", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("全製品分の index.html が生成されていること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const missing = products.filter(p => !existsSync(join(PRODUCTS_DIR, p.slug, "index.html")));
    assert.equal(missing.length, 0,
      `ファイル欠落: ${missing.slice(0, 5).map(p => p.slug).join(", ")}`);
  });

  test("生成済み製品ページ数が products.json の件数と一致すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const dirs = readdirSync(PRODUCTS_DIR).filter(d =>
      existsSync(join(PRODUCTS_DIR, d, "index.html"))
    );
    assert.equal(dirs.length, products.length,
      `ページ数 ${dirs.length} ≠ products.json 件数 ${products.length}`);
  });
});

describe("product-pages: SEO 契約", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("<title> に製品名と 'Specs' が含まれること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<title>([^<]+)<\/title>/);
      if (!m) { violations.push(`${p.slug}: title タグなし`); continue; }
      if (!m[1].includes("Specs")) violations.push(`${p.slug}: 'Specs' が title にない (${m[1]})`);
      if (!m[1].includes(escapeHtml(p.brand))) violations.push(`${p.slug}: ブランド名が title にない`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("<h1> に製品名と 'Specs' が含まれること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<h1>([^<]+)<\/h1>/);
      if (!m) { violations.push(`${p.slug}: h1 タグなし`); continue; }
      if (!m[1].includes(escapeHtml(p.brand))) violations.push(`${p.slug}: ブランド名が h1 にない`);
      if (!m[1].includes("Specs")) violations.push(`${p.slug}: 'Specs' が h1 にない`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("canonical URL が /products/{slug}/ 形式であること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/rel="canonical"\s+href="([^"]+)"/);
      if (!m) { violations.push(`${p.slug}: canonical 欠落`); continue; }
      if (!m[1].includes(`/products/${p.slug}/`)) {
        violations.push(`${p.slug}: canonical パス不正 (${m[1]})`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("meta description が存在すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/<meta\s+name="description"\s+content="[^"]{10,}"/.test(html);
    });
    assert.equal(missing.length, 0,
      `meta description 欠落または短すぎる: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("JSON-LD が @type:Product を含むこと", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 20);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const m = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
      if (!m) { violations.push(`${p.slug}: JSON-LD なし`); continue; }
      let ld;
      try { ld = JSON.parse(m[1]); } catch { violations.push(`${p.slug}: JSON-LD パース失敗`); continue; }
      if (ld["@type"] !== "Product") violations.push(`${p.slug}: @type が Product でない (${ld["@type"]})`);
      if (!ld.name || !ld.name.includes(p.brand)) violations.push(`${p.slug}: JSON-LD name にブランドなし`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("OGP タグが揃っていること (og:type, og:title, og:description, og:url)", () => {
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
        if (!html.includes(tag)) violations.push(`${p.slug}: ${tag} 欠落`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 5).join(" / "));
  });

  test("比較リンク (.compare-links) が存在し、/compare/ URL を含むこと", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      if (!html.includes('class="compare-links"')) {
        violations.push(`${p.slug}: compare-links 欠落`);
        continue;
      }
      const linkCount = (html.match(/href="[^"]*\/compare\//g) || []).length;
      if (linkCount === 0) violations.push(`${p.slug}: compare リンクが 0 件`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });
});

describe("product-pages: a11y 契約", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("skip-link が存在すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/class="skip-link"[^>]*>Skip to main content</.test(html);
    });
    assert.equal(missing.length, 0,
      `skip-link 欠落: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("<main id=\"main\"> が存在すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/<main id="main">/.test(html);
    });
    assert.equal(missing.length, 0,
      `<main id="main"> 欠落: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("スペック表に <caption class=\"sr-only\"> があること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const missing = sample.filter(p => {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      return !/<caption class="sr-only">/.test(html);
    });
    assert.equal(missing.length, 0,
      `caption sr-only 欠落: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
  });

  test("spec 表の各行に <th scope=\"row\"> が使われていること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const sample = sampleDirs(products, 15);
    const violations = [];
    for (const p of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, p.slug, "index.html"), "utf8");
      const count = (html.match(/<th scope="row"/g) || []).length;
      if (count < 20) violations.push(`${p.slug}: th[scope=row] が ${count} 件のみ`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("外部リンクに rel=\"noopener noreferrer\" が付与されていること", () => {
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
      `noopener noreferrer 欠落: ${violations.slice(0, 3).join(" / ")}`);
  });
});
