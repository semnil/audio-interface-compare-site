// tests/og-images.test.js
// og:image (SNS 共有カード) の生成とメタタグ配線の検証
// dist/ が未生成の場合はスキップ
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

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("og-images: ファイル生成", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("サイト共通 + 全製品 + 全ハブの og 画像が存在すること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    assert.ok(existsSync(join(OG_DIR, "site.png")), "og/site.png が無い");
    const missing = products.filter(p => !existsSync(join(OG_DIR, "products", `${p.slug}.png`)));
    assert.equal(missing.length, 0, `製品 og 画像欠落: ${missing.slice(0, 3).map(p => p.slug).join(", ")}`);
    const brands = new Set(products.map(p => p.brand).filter(Boolean));
    const brandPngs = readdirSync(join(OG_DIR, "brands")).filter(f => f.endsWith(".png"));
    assert.equal(brandPngs.length, brands.size, `ブランド og 画像 ${brandPngs.length} ≠ ${brands.size}`);
  });

  test("og 画像が有効な PNG であること (マジックバイト検査)", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    for (const p of products.slice(0, 5)) {
      const buf = readFileSync(join(OG_DIR, "products", `${p.slug}.png`));
      assert.ok(buf.subarray(0, 4).equals(PNG_MAGIC), `${p.slug}: PNG マジックバイト不一致`);
      assert.ok(buf.length > 1000, `${p.slug}: PNG が小さすぎる (${buf.length} bytes)`);
    }
  });
});

describe("og-images: メタタグ配線", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("製品ページの og:image が自身の og 画像 URL を指し、twitter:card が summary_large_image であること", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const violations = [];
    for (const p of products.slice(0, 10)) {
      const html = readFileSync(join(DIST, "products", p.slug, "index.html"), "utf8");
      const img = html.match(/property="og:image" content="([^"]+)"/)?.[1];
      if (!img || !img.includes(`/og/products/${p.slug}.png`)) violations.push(`${p.slug}: og:image=${img}`);
      if (!html.includes('name="twitter:card" content="summary_large_image"')) violations.push(`${p.slug}: twitter:card 不正`);
      if (!html.includes('property="og:image:width"')) violations.push(`${p.slug}: og:image:width 欠落`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("ja ページの og:image はルートの共有画像を指すこと (/ja/ プレフィックスされない)", () => {
    const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    for (const p of products.slice(0, 5)) {
      const html = readFileSync(join(DIST, "ja", "products", p.slug, "index.html"), "utf8");
      const img = html.match(/property="og:image" content="([^"]+)"/)?.[1];
      assert.ok(img && !img.includes("/ja/og/"), `${p.slug}: ja ページの og:image が /ja/ 配下: ${img}`);
    }
  });
});
