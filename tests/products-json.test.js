// tests/products-json.test.js
// ビルド済み dist/products.json の構造・不変条件の検証
// dist/ が未生成の場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(PRODUCTS_PATH);

describe("products.json の構造検証", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  let products;

  test("products.json が有効な JSON として読み込めること", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    assert.ok(Array.isArray(products), "配列でなければならない");
    assert.ok(products.length >= 100, `製品数が少なすぎる: ${products.length}`);
  });

  test("全製品が brand / model / slug / displayName を持つこと", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const missing = products.filter(p =>
      !p.brand || !p.model || !p.slug || !p.displayName
    );
    assert.equal(missing.length, 0,
      `必須フィールド欠損: ${missing.length} 件 (例: ${JSON.stringify(missing[0])?.slice(0, 200)})`);
  });

  test("slug の一意性 (重複ゼロ)", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const slugs = products.map(p => p.slug);
    const seen = new Set();
    const dups = [];
    for (const s of slugs) {
      if (seen.has(s)) dups.push(s);
      seen.add(s);
    }
    assert.equal(dups.length, 0, `slug 衝突: ${dups.slice(0, 5).join(", ")}`);
  });

  test("slug が英小文字・数字・ハイフン・日本語のみで構成されること", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const invalid = products.filter(p =>
      !/^[a-z0-9\-\u3040-\u9fff]+$/.test(p.slug)
    );
    assert.equal(invalid.length, 0,
      `slug 不正文字: ${invalid.slice(0, 3).map(x => x.slug).join(", ")}`);
  });

  test("slug の先頭・末尾にハイフンが無いこと", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p =>
      p.slug.startsWith("-") || p.slug.endsWith("-")
    );
    assert.equal(bad.length, 0,
      `slug 端ハイフン: ${bad.slice(0, 3).map(x => x.slug).join(", ")}`);
  });

  test("slug に連続ハイフン '--' が含まれないこと", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p => p.slug.includes("--"));
    assert.equal(bad.length, 0,
      `slug 連続ハイフン: ${bad.slice(0, 3).map(x => x.slug).join(", ")}`);
  });

  test("displayName が '{brand} {model}' 形式であること", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p => p.displayName !== `${p.brand} ${p.model}`);
    assert.equal(bad.length, 0,
      `displayName 不整合: ${bad.slice(0, 3).map(x => x.displayName).join(" / ")}`);
  });

  test("price が存在する場合は数値 (number 型) であること", () => {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p =>
      p.price != null && typeof p.price !== "number"
    );
    assert.equal(bad.length, 0,
      `price が非数値: ${bad.slice(0, 3).map(x => `${x.displayName}=${typeof x.price}`).join(", ")}`);
  });

  test("url が存在する場合は https:// または http:// で始まる文字列 (セキュリティ)", () => {
    // compare ページで a.url を href="${escapeHtml(a.url)}" に埋め込むため、
    // javascript: / data: / vbscript: スキーム混入は XSS リスクとなる。
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p => {
      if (p.url == null || p.url === "") return false;
      if (typeof p.url !== "string") return true;
      return !/^https?:\/\//i.test(p.url);
    });
    assert.equal(bad.length, 0,
      `url が http(s) 以外のスキーム: ${bad.slice(0, 3).map(x => `${x.displayName}=${x.url}`).join(", ")}`);
  });

  test("brand / model に HTML 特殊文字 (<, >) が含まれないこと (XSS 防御)", () => {
    // escapeHtml はビルド時に入るが、インジェクションを受けにくいデータを維持するため
    // < > を含むデータが入ったら警告する
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const bad = products.filter(p =>
      /[<>]/.test(p.brand) || /[<>]/.test(p.model)
    );
    assert.equal(bad.length, 0,
      `HTML 特殊文字を含む brand/model: ${bad.slice(0, 3).map(x => x.displayName).join(" / ")}`);
  });

  test("brand / model / notes に </script> 文字列が含まれないこと (JSON 埋め込み XSS 防御)", () => {
    // index.html 内で JSON.stringify(products) が <script> タグ内に直挿入されるため、
    // 文字列中に </script> があるとスクリプト脱出となる (S2)
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const hazard = products.filter(p => {
      const joined = [p.brand, p.model, p.category, p.notes, p.bundle]
        .filter(Boolean).join("\n").toLowerCase();
      return joined.includes("</script");
    });
    assert.equal(hazard.length, 0,
      `</script> を含む製品: ${hazard.slice(0, 3).map(x => x.displayName).join(", ")}`);
  });

  test("brand / model に U+2028/U+2029 (JSON-in-script 破壊文字) が含まれないこと", () => {
    // U+2028/U+2029 は JavaScript 内で改行として解釈される。
    // JSON.stringify はエスケープしないため、<script> 内 JSON 埋め込みで構文破壊する
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const hazard = products.filter(p =>
      /[\u2028\u2029]/.test(p.brand + p.model + (p.category || ""))
    );
    assert.equal(hazard.length, 0,
      `U+2028/U+2029 を含む製品: ${hazard.slice(0, 3).map(x => x.displayName).join(", ")}`);
  });
});
