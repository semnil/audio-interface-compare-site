// tests/og-images.test.js
// Checks og:image (social share card) generation and meta tag wiring
// Skipped when dist/ has not been built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const OG_DIR = join(DIST, "og");
const PRODUCTS_PATH = join(DIST, "products.json");
const distExists = existsSync(OG_DIR) && existsSync(PRODUCTS_PATH);

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

describe("og-images: file generation", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("og images exist for the site, every product, and every hub", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    assert.ok(existsSync(join(OG_DIR, "site.jpg")), "og/site.jpg is missing");
    const missing = products.filter(p => !existsSync(join(OG_DIR, "products", `${p.slug}.jpg`)));
    assert.equal(missing.length, 0, `missing product og images: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
    const brands = new Set(products.map(p => p.brand).filter(Boolean));
    const brandImages = readdirSync(join(OG_DIR, "brands")).filter(f => f.endsWith(".jpg"));
    assert.equal(brandImages.length, brands.size, `brand og images ${brandImages.length} != ${brands.size}`);
  });

  test("og images are valid JPEGs (magic byte check)", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    for (const p of products.slice(0, 5)) {
      const buf = readFileSync(join(OG_DIR, "products", `${p.slug}.jpg`));
      assert.ok(buf.subarray(0, 3).equals(JPEG_MAGIC), `${p.slug}: JPEG magic bytes do not match`);
      assert.ok(buf.length > 1000, `${p.slug}: JPEG is too small (${buf.length} bytes)`);
    }
  });
});

describe("og-images: meta tag wiring", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("product page og:image points to its own og image URL and twitter:card is summary_large_image", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const violations = [];
    for (const p of products.slice(0, 10)) {
      const html = readFileSync(join(DIST, "products", p.slug, "index.html"), "utf8");
      const img = html.match(/property="og:image" content="([^"]+)"/)?.[1];
      if (!img || !img.includes(`/og/products/${p.slug}.jpg`)) violations.push(`${p.slug}: og:image=${img}`);
      if (!html.includes('name="twitter:card" content="summary_large_image"')) violations.push(`${p.slug}: twitter:card is invalid`);
      if (!html.includes('property="og:image:width"')) violations.push(`${p.slug}: og:image:width is missing`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("ja page og:image points to the shared root image (not prefixed with /ja/)", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    for (const p of products.slice(0, 5)) {
      const html = readFileSync(join(DIST, "ja", "products", p.slug, "index.html"), "utf8");
      const img = html.match(/property="og:image" content="([^"]+)"/)?.[1];
      assert.ok(img && !img.includes("/ja/og/"), `${p.slug}: ja page og:image is under /ja/: ${img}`);
    }
  });
});
