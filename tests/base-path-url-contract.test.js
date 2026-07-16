// tests/base-path-url-contract.test.js
// SITE_URL / BASE_PATH / canonical URL の構造契約検証
// - index / 製品ページの canonical は自己参照の絶対 URL
// - canonical URL のパス部に //, 不正文字, BASE_PATH 重複が含まれない
// - canonical URL のホストが sitemap.xml と一致する (同一サイト内で一貫)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUCTS_DIR = join(ROOT, "dist", "products");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const SITEMAP_PATH = join(ROOT, "dist", "sitemap.xml");
const distExists = existsSync(PRODUCTS_DIR) && existsSync(INDEX_PATH) && existsSync(SITEMAP_PATH);

function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("canonical URL の構造契約", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("index.html の canonical URL はパーサブルな絶対 URL", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, "index canonical 欠落");
    const url = new URL(canonical);
    assert.ok(url.protocol === "http:" || url.protocol === "https:",
      `canonical が http(s) でない: ${url.protocol}`);
    // パスに // が含まれない (プロトコル部分の // 以外)
    assert.equal(url.pathname.includes("//"), false,
      `canonical pathname に // が含まれる: ${url.pathname}`);
  });

  test("製品ページ 15 件の canonical URL はパース可能で http(s)、末尾スラッシュ + /products/ を含む", () => {
    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      if (!canonical) { violations.push(`${d}: canonical 欠落`); continue; }
      try {
        const url = new URL(canonical);
        if (!/^https?:$/.test(url.protocol)) violations.push(`${d}: ${url.protocol}`);
        if (url.pathname.includes("//")) violations.push(`${d}: pathname に //: ${url.pathname}`);
        if (!url.pathname.endsWith("/")) violations.push(`${d}: 末尾スラッシュなし: ${url.pathname}`);
        if (!url.pathname.includes("/products/")) violations.push(`${d}: /products/ パスなし: ${url.pathname}`);
      } catch (e) {
        violations.push(`${d}: parse fail: ${e.message}`);
      }
    }
    assert.equal(violations.length, 0, `canonical URL 構造違反: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("canonical URL のホスト部が sitemap.xml と一致する (同一サイト内で一貫)", () => {
    const sitemap = readFileSync(SITEMAP_PATH, "utf8");
    const firstLoc = sitemap.match(/<loc>([^<]+)<\/loc>/)?.[1];
    assert.ok(firstLoc, "sitemap に URL なし");
    const sitemapHost = new URL(firstLoc).host;

    const indexHtml = readFileSync(INDEX_PATH, "utf8");
    const indexCanonical = indexHtml.match(/rel="canonical" href="([^"]+)"/)?.[1];
    const indexHost = new URL(indexCanonical).host;
    assert.equal(sitemapHost, indexHost, `index canonical host と sitemap host が不一致`);

    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 5);
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      const host = new URL(canonical).host;
      assert.equal(host, sitemapHost,
        `${d} canonical host (${host}) と sitemap host (${sitemapHost}) が不一致`);
    }
  });

  test("BASE_PATH は canonical pathname 内に 2 回以上出現しない (重複設定の回帰検知)", () => {
    // ローカル default SITE_URL ('https://.../audio-interface-compare-site') + BASE_PATH='/audio-interface-compare-site/'
    // のような misconfig が起きると canonical pathname にレポジトリ名が 2 回登場する
    const html = readFileSync(INDEX_PATH, "utf8");
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    const url = new URL(canonical);
    const parts = url.pathname.split("/").filter(Boolean);
    const counts = new Map();
    for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    assert.equal(dupes.length, 0,
      `canonical pathname にパスセグメント重複: ${JSON.stringify(dupes)} (pathname=${url.pathname})`);
  });

  test("製品ページの canonical URL が sitemap.xml 内に存在する (10 件サンプル)", () => {
    const sitemap = readFileSync(SITEMAP_PATH, "utf8");
    const sitemapUrls = new Set(
      (sitemap.match(/<loc>([^<]+)<\/loc>/g) || []).map(m => m.replace(/<\/?loc>/g, ""))
    );
    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 10);
    const missing = [];
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      if (!sitemapUrls.has(canonical)) missing.push(`${d}: canonical=${canonical} が sitemap に無い`);
    }
    assert.equal(missing.length, 0,
      `sitemap 未掲載の canonical: ${missing.slice(0, 3).join(" / ")}`);
  });
});
