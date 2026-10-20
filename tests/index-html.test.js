// tests/index-html.test.js
// Quality and safety checks for the built dist/index.html
// Skipped when dist/ is not built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(INDEX_PATH) && existsSync(PRODUCTS_PATH);

describe("index.html quality checks", { skip: !distExists ? "dist/ not built. Run npm run build" : false }, () => {
  let html;
  let products;

  test("index.html / products.json can be read", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    assert.ok(html.length > 1000, "index.html is nearly empty");
  });

  test("all OGP tags are present (og:type, og:title, og:description, og:url, og:site_name)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const required = [
      'property="og:type"',
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
      'property="og:site_name"',
    ];
    const missing = required.filter(tag => !html.includes(tag));
    assert.equal(missing.length, 0, `missing OGP: ${missing.join(", ")}`);
  });

  test("Twitter Card tags exist", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(html.includes('name="twitter:card"'), "twitter:card is missing");
    assert.ok(html.includes('name="twitter:title"'), "twitter:title is missing");
  });

  test("the viewport meta exists (mobile support)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<meta\s+name="viewport"/i.test(html), "viewport meta is missing");
  });

  test("favicon links of 2 kinds (SVG/ICO) exist", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/rel="icon"[^>]*favicon\.svg/i.test(html), "favicon.svg link is missing");
    assert.ok(/rel="icon"[^>]*favicon\.ico/i.test(html), "favicon.ico link is missing");
  });

  test("the inline PRODUCTS JSON is embedded and its count matches products.json", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    assert.ok(m, "PRODUCTS embedding not found");
    const inline = JSON.parse(m[1]);
    assert.equal(inline.length, products.length,
      `inline PRODUCTS count ${inline.length} != products.json count ${products.length}`);
  });

  test("the inline PRODUCTS JSON does not contain a large number of fields not needed for publishing (size control)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    const inline = JSON.parse(m[1]);
    // Only the fields needed for search and display: slug, brand, model, displayName, category, price
    const expectedKeys = new Set(["slug", "brand", "model", "displayName", "category", "price"]);
    const extra = new Set();
    for (const p of inline) {
      for (const k of Object.keys(p)) {
        if (!expectedKeys.has(k)) extra.add(k);
      }
    }
    assert.equal(extra.size, 0,
      `unneeded fields mixed into PRODUCTS of index.html: ${[...extra].join(", ")}`);
  });

  test("the PRODUCTS JSON inside the <script> tag does not contain the string </script> (defense against script breakout)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    assert.ok(m, "PRODUCTS embedding not found");
    const jsonLiteral = m[1];
    assert.equal(jsonLiteral.toLowerCase().includes("</script"), false,
      "the PRODUCTS array contains the string </script> (risk of script breakout XSS)");
  });

  test("the inline JSON does not contain U+2028/U+2029 (JSON-in-script safety)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    const jsonLiteral = m[1];
    assert.equal(/[\u2028\u2029]/.test(jsonLiteral), false,
      "the PRODUCTS array contains U+2028/U+2029 (risk of breaking the JS parser)");
  });

  test("ai-disclaimer exists (disclaimer)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/class="ai-disclaimer"/.test(html), "ai-disclaimer class is missing");
  });

  test("the product count display (subtitle) matches products.json", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const m = html.match(/<div class="subtitle"[^>]*>(\d+)/);
    assert.ok(m, "cannot extract the product count in subtitle");
    assert.equal(Number(m[1]), products.length,
      `UI display ${m[1]} and products.json ${products.length} do not match`);
  });

  test("the build date in the footer is in YYYY-MM-DD format", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/Last updated: \d{4}-\d{2}-\d{2}/.test(html),
      "the footer does not contain the build date in YYYY-MM-DD format");
  });

  test("the report issue link points to GitHub Issues", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/https:\/\/github\.com\/semnil\/audio-interface-compare-site\/issues/.test(html),
      "the GitHub link for report issue is missing");
  });

  test("search-input has autocomplete=\"off\" set", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // Search runs on every input, so autocomplete is unnecessary
    const inputs = html.match(/<input[^>]*class="search-input"[^>]*>/g) || [];
    assert.ok(inputs.length >= 2, `expected 2 or more search-inputs: actual=${inputs.length}`);
    const missing = inputs.filter(i => !/autocomplete="off"/.test(i));
    assert.equal(missing.length, 0, `autocomplete attribute is missing: ${missing.length} items`);
  });

  test("the i18n.js script tag exists", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/src="[^"]*i18n\.js"/.test(html), "i18n.js script tag is missing");
  });

  test("the PAGE_JA object contains the translations of subtitle / productA / productB / searchPlaceholder / compareBtn / footer", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/var PAGE_JA=(\{[^}]+\})/);
    assert.ok(m, "PAGE_JA object not found");
    // JSON serialization by safeJsonForScript (keys are double-quoted)
    const parsed = JSON.parse(m[1].replace(/\\u003c/g, "<"));
    const required = ["subtitle", "productA", "productB", "searchPlaceholder", "compareBtn", "footer"];
    const missing = required.filter(k => !parsed[k]);
    assert.equal(missing.length, 0, `missing PAGE_JA translation keys: ${missing.join(", ")}`);
  });
});

describe("index.html accessibility checks", { skip: !distExists ? "dist/ not built" : false }, () => {
  let html;

  test("label elements are wired to the inputs with the for attribute", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<label\s+for="search-a"/.test(html), "no label tied to search-a");
    assert.ok(/<label\s+for="search-b"/.test(html), "no label tied to search-b");
  });

  test("product-list has role=\"listbox\"", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<div\s+class="product-list"\s+id="list-a"\s+role="listbox"/.test(html),
      "role=listbox of list-a is missing");
    assert.ok(/<div\s+class="product-list"\s+id="list-b"\s+role="listbox"/.test(html),
      "role=listbox of list-b is missing");
  });

  test("the inline script renders product-item as <button type=\"button\" role=\"option\">", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // Checks the innerHTML template string inside renderList
    assert.ok(/<button type="button" role="option" class="product-item/.test(html),
      "product-item is not generated as button + role=option");
  });

  test("the skip-link (Skip to main content) exists", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/class="skip-link"[^>]*>Skip to main content</.test(html),
      "skip-link does not exist");
  });

  test("<main id=\"main\"> exists", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<main\s+id="main">/.test(html), "the main element has no id=main");
  });

  test("the canonical link exists", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<link\s+rel="canonical"/.test(html), "canonical link is missing");
  });

  test("an aria-live region exists (selection state announcements)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/aria-live="polite"[^>]*id="selection-status"/.test(html),
      "aria-live region does not exist");
  });

  test("a noscript warning exists", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<noscript>/.test(html), "noscript tag does not exist");
  });

  test("the Specs link (.specs-link) exists inside product-item-wrap", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/class="product-item-wrap"/.test(html), "product-item-wrap class is missing");
    assert.ok(/class="specs-link"/.test(html), "specs-link class is missing");
  });

  test("the href of the Specs link is generated in the form PAGE_BASE + 'products/' + slug (JS code check)", () => {
    // specs-link is generated dynamically by JS inside renderList, so the href value is not expanded in the static HTML.
    // Checks that the specsHref generation pattern exists in the JS code.
    // PAGE_BASE is the per-language page link base (on ja pages localizeToJa rewrites it to /ja/)
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/var specsHref = PAGE_BASE \+ 'products\/' \+ p\.slug \+ '\/'/.test(html),
      "the specsHref URL generation code is not in index.html");
  });

  test("tabindex=\"-1\" is set on the Specs link (JS code check)", () => {
    // specs-link is generated dynamically by JS, so this checks that the string tabindex=\"-1\" is in the code.
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/tabindex="-1"[^>]*specs-link|specs-link[^>]*tabindex="-1"/.test(html),
      "the tabindex=-1 setting of specs-link does not exist in the code");
  });
});
