// tests/base-path-url-contract.test.js
// Structural contract checks for SITE_URL / BASE_PATH / canonical URL
// - The canonical of the index / product pages is a self-referencing absolute URL
// - The path part of the canonical URL contains no //, no invalid characters, and no duplicated BASE_PATH
// - The host of the canonical URL matches sitemap.xml (consistent within the same site)
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

describe("canonical URL structural contract", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the canonical URL of index.html is a parsable absolute URL", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, "index canonical is missing");
    const url = new URL(canonical);
    assert.ok(url.protocol === "http:" || url.protocol === "https:",
      `canonical is not http(s): ${url.protocol}`);
    // The path contains no // (other than the // of the protocol part)
    assert.equal(url.pathname.includes("//"), false,
      `canonical pathname contains //: ${url.pathname}`);
  });

  test("the canonical URLs of 15 product pages are parsable, http(s), and contain a trailing slash + /products/", () => {
    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      if (!canonical) { violations.push(`${d}: canonical is missing`); continue; }
      try {
        const url = new URL(canonical);
        if (!/^https?:$/.test(url.protocol)) violations.push(`${d}: ${url.protocol}`);
        if (url.pathname.includes("//")) violations.push(`${d}: // in pathname: ${url.pathname}`);
        if (!url.pathname.endsWith("/")) violations.push(`${d}: no trailing slash: ${url.pathname}`);
        if (!url.pathname.includes("/products/")) violations.push(`${d}: no /products/ path: ${url.pathname}`);
      } catch (e) {
        violations.push(`${d}: parse fail: ${e.message}`);
      }
    }
    assert.equal(violations.length, 0, `canonical URL structure violations: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("the host part of the canonical URL matches sitemap.xml (consistent within the same site)", () => {
    const sitemap = readFileSync(SITEMAP_PATH, "utf8");
    const firstLoc = sitemap.match(/<loc>([^<]+)<\/loc>/)?.[1];
    assert.ok(firstLoc, "no URL in sitemap");
    const sitemapHost = new URL(firstLoc).host;

    const indexHtml = readFileSync(INDEX_PATH, "utf8");
    const indexCanonical = indexHtml.match(/rel="canonical" href="([^"]+)"/)?.[1];
    const indexHost = new URL(indexCanonical).host;
    assert.equal(sitemapHost, indexHost, `index canonical host and sitemap host do not match`);

    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 5);
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      const host = new URL(canonical).host;
      assert.equal(host, sitemapHost,
        `${d} canonical host (${host}) and sitemap host (${sitemapHost}) do not match`);
    }
  });

  test("BASE_PATH does not appear twice or more in the canonical pathname (regression check for duplicated configuration)", () => {
    // A misconfiguration such as local default SITE_URL ('https://.../audio-interface-compare-site') + BASE_PATH='/audio-interface-compare-site/'
    // makes the repository name appear twice in the canonical pathname
    const html = readFileSync(INDEX_PATH, "utf8");
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    const url = new URL(canonical);
    const parts = url.pathname.split("/").filter(Boolean);
    const counts = new Map();
    for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    assert.equal(dupes.length, 0,
      `duplicated path segments in canonical pathname: ${JSON.stringify(dupes)} (pathname=${url.pathname})`);
  });

  test("the canonical URLs of product pages exist in sitemap.xml (10-item sample)", () => {
    const sitemap = readFileSync(SITEMAP_PATH, "utf8");
    const sitemapUrls = new Set(
      (sitemap.match(/<loc>([^<]+)<\/loc>/g) || []).map(m => m.replace(/<\/?loc>/g, ""))
    );
    const sample = sampleDirs(readdirSync(PRODUCTS_DIR), 10);
    const missing = [];
    for (const d of sample) {
      const html = readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      if (!sitemapUrls.has(canonical)) missing.push(`${d}: canonical=${canonical} is not in sitemap`);
    }
    assert.equal(missing.length, 0,
      `canonical not listed in sitemap: ${missing.slice(0, 3).join(" / ")}`);
  });
});
