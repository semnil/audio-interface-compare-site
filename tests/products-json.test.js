// tests/products-json.test.js
// Checks the structure and invariants of the built dist/products.json
// Skipped when dist/ has not been built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(PRODUCTS_PATH);

describe("products.json structure", { skip: !distExists ? "dist/ not built. Run npm run build" : false }, () => {
  let products;

  test("products.json loads as valid JSON", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    assert.ok(Array.isArray(products), "must be an array");
    assert.ok(products.length >= 100, `too few products: ${products.length}`);
  });

  test("every product has brand / model / slug / displayName", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const missing = products.filter(p =>
      !p.brand || !p.model || !p.slug || !p.displayName
    );
    assert.equal(missing.length, 0,
      `required fields missing: ${missing.length} products (e.g. ${JSON.stringify(missing[0])?.slice(0, 200)})`);
  });

  test("slug uniqueness (zero duplicates)", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const slugs = products.map(p => p.slug);
    const seen = new Set();
    const dups = [];
    for (const s of slugs) {
      if (seen.has(s)) dups.push(s);
      seen.add(s);
    }
    assert.equal(dups.length, 0, `slug collision: ${dups.slice(0, 5).join(", ")}`);
  });

  test("slug consists only of lowercase ASCII letters, digits, hyphens, and Japanese characters", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const invalid = products.filter(p =>
      !/^[a-z0-9\-\u3040-\u9fff]+$/.test(p.slug)
    );
    assert.equal(invalid.length, 0,
      `invalid characters in slug: ${invalid.slice(0, 3).map(x => x.slug).join(", ")}`);
  });

  test("slug has no leading or trailing hyphen", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p =>
      p.slug.startsWith("-") || p.slug.endsWith("-")
    );
    assert.equal(bad.length, 0,
      `slug edge hyphen: ${bad.slice(0, 3).map(x => x.slug).join(", ")}`);
  });

  test("slug contains no consecutive hyphens '--'", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p => p.slug.includes("--"));
    assert.equal(bad.length, 0,
      `slug consecutive hyphens: ${bad.slice(0, 3).map(x => x.slug).join(", ")}`);
  });

  test("displayName has the '{brand} {model}' form", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p => p.displayName !== `${p.brand} ${p.model}`);
    assert.equal(bad.length, 0,
      `displayName mismatch: ${bad.slice(0, 3).map(x => x.displayName).join(" / ")}`);
  });

  test("price, when present, is numeric (number type)", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p =>
      p.price != null && typeof p.price !== "number"
    );
    assert.equal(bad.length, 0,
      `price is non-numeric: ${bad.slice(0, 3).map(x => `${x.displayName}=${typeof x.price}`).join(", ")}`);
  });

  test("url, when present, is a string starting with https:// or http:// (security)", () => {
    // The compare page embeds a.url as href="${escapeHtml(a.url)}", so
    // a javascript: / data: / vbscript: scheme slipping in is an XSS risk.
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p => {
      if (p.url == null || p.url === "") return false;
      if (typeof p.url !== "string") return true;
      return !/^https?:\/\//i.test(p.url);
    });
    assert.equal(bad.length, 0,
      `url has a scheme other than http(s): ${bad.slice(0, 3).map(x => `${x.displayName}=${x.url}`).join(", ")}`);
  });

  test("brand / model contain no HTML special characters (<, >) (XSS defense)", () => {
    // escapeHtml is applied at build time, but to keep the data resistant to injection
    // this warns when data containing < > is added
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p =>
      /[<>]/.test(p.brand) || /[<>]/.test(p.model)
    );
    assert.equal(bad.length, 0,
      `brand/model containing HTML special characters: ${bad.slice(0, 3).map(x => x.displayName).join(" / ")}`);
  });

  test("brand / model / notes contain no </script> string (JSON embedding XSS defense)", () => {
    // index.html inserts JSON.stringify(products) directly inside a <script> tag, so
    // a </script> in a string escapes the script (S2)
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const hazard = products.filter(p => {
      const joined = [p.brand, p.model, p.category, p.notes, p.bundle]
        .filter(Boolean).join("\n").toLowerCase();
      return joined.includes("</script");
    });
    assert.equal(hazard.length, 0,
      `products containing </script>: ${hazard.slice(0, 3).map(x => x.displayName).join(", ")}`);
  });

  test("brand / model contain no U+2028/U+2029 (characters that break JSON-in-script)", () => {
    // U+2028/U+2029 are interpreted as line breaks inside JavaScript.
    // JSON.stringify does not escape them, so they break the syntax of JSON embedded in <script>
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const hazard = products.filter(p =>
      /[\u2028\u2029]/.test(p.brand + p.model + (p.category || ""))
    );
    assert.equal(hazard.length, 0,
      `products containing U+2028/U+2029: ${hazard.slice(0, 3).map(x => x.displayName).join(", ")}`);
  });
});
