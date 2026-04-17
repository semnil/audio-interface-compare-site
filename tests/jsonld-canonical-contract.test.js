// tests/jsonld-canonical-contract.test.js
// Round 3 の M-new-2 修正検証:
// 逆順ページでも JSON-LD の name / about は正規順に固定される (canonical と一致)
// 一方 h1 / title / og:title は表示順 (B vs A) を保持する (設計契約)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COMPARE_DIR = join(ROOT, "dist", "compare");
const distExists = existsSync(COMPARE_DIR);

function parseDirName(dirName) {
  const idx = dirName.indexOf("-vs-");
  if (idx === -1) return null;
  return [dirName.slice(0, idx), dirName.slice(idx + 4)];
}

function sampleDirs(allDirs, count) {
  const step = Math.max(1, Math.floor(allDirs.length / count));
  return allDirs.filter((_, i) => i % step === 0).slice(0, count);
}

function extractJsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1]);
}

describe("JSON-LD 正規化契約: 逆順ページでも name / about は正規順", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("逆順ページ 10 件で JSON-LD.name が正規順 (canonicalSlugA の displayName vs canonicalSlugB の displayName) になっている", () => {
    const dirs = readdirSync(COMPARE_DIR);
    const reverseDirs = dirs.filter(d => {
      const p = parseDirName(d);
      return p && p[0] > p[1];
    });
    const sample = sampleDirs(reverseDirs, 10);
    const violations = [];
    for (const d of sample) {
      const [slugA, slugB] = parseDirName(d); // slugA > slugB (逆順)
      // 正規順の slug: slugB < slugA
      const canonSlugLeft = slugB;
      const canonSlugRight = slugA;
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const jsonLd = extractJsonLd(html);
      if (!jsonLd) { violations.push(`${d}: JSON-LD なし`); continue; }
      // name に含まれる文字列順序を確認
      // name: "{canonLeft displayName} vs {canonRight displayName} — Audio Interface Comparator"
      const nameBody = jsonLd.name.replace(/ — Audio Interface Comparator$/, "");
      const [leftName, rightName] = nameBody.split(" vs ");
      if (!leftName || !rightName) {
        violations.push(`${d}: name に ' vs ' 区切りなし: ${jsonLd.name}`);
        continue;
      }
      // about[0] が left, about[1] が right に対応
      if (jsonLd.about[0].name !== leftName) {
        violations.push(`${d}: about[0].name (${jsonLd.about[0].name}) ≠ name left (${leftName})`);
      }
      if (jsonLd.about[1].name !== rightName) {
        violations.push(`${d}: about[1].name (${jsonLd.about[1].name}) ≠ name right (${rightName})`);
      }
    }
    assert.equal(violations.length, 0, `JSON-LD 正規順違反: ${violations.slice(0, 3).join(" / ")}`);
  });

  test("逆順ページで JSON-LD.name と <title> が不一致 (設計契約: title は表示順、name は正規順)", () => {
    const dirs = readdirSync(COMPARE_DIR);
    const reverseDirs = dirs.filter(d => {
      const p = parseDirName(d);
      return p && p[0] > p[1];
    });
    if (reverseDirs.length === 0) return;
    const sample = sampleDirs(reverseDirs, 5);
    for (const d of sample) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const jsonLd = extractJsonLd(html);
      const title = html.match(/<title>([^<]+)<\/title>/)[1];
      // title は escapeHtml 済み (&amp;)、jsonLd.name は生の &
      // 比較のため両方を正規化
      const normalizedTitle = title.replace(/&amp;/g, "&");
      // 逆順ページでは title と jsonLd.name は異なる (表示順 vs 正規順)
      assert.notEqual(jsonLd.name, normalizedTitle,
        `${d}: 逆順ページなのに JSON-LD.name と title が一致 (正規化失敗の可能性)`);
    }
  });

  test("正規順ページでは JSON-LD.name と <title> が (&amp;正規化後) 一致する", () => {
    const dirs = readdirSync(COMPARE_DIR);
    const canonDirs = dirs.filter(d => {
      const p = parseDirName(d);
      return p && p[0] < p[1];
    });
    const sample = sampleDirs(canonDirs, 5);
    for (const d of sample) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const jsonLd = extractJsonLd(html);
      const title = html.match(/<title>([^<]+)<\/title>/)[1];
      const normalizedTitle = title.replace(/&amp;/g, "&");
      assert.equal(jsonLd.name, normalizedTitle,
        `${d}: 正規順ページで JSON-LD.name と title が不一致 (${jsonLd.name} vs ${normalizedTitle})`);
    }
  });

  test("全サンプルで JSON-LD.about は 2 要素 Product 配列、brand を持つ", () => {
    const dirs = sampleDirs(readdirSync(COMPARE_DIR), 15);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(COMPARE_DIR, d, "index.html"), "utf8");
      const jsonLd = extractJsonLd(html);
      if (!jsonLd) { violations.push(`${d}: JSON-LD なし`); continue; }
      if (!Array.isArray(jsonLd.about) || jsonLd.about.length !== 2) {
        violations.push(`${d}: about が 2 要素配列でない`);
        continue;
      }
      for (const prod of jsonLd.about) {
        if (prod["@type"] !== "Product") violations.push(`${d}: Product でない`);
        if (typeof prod.name !== "string" || !prod.name) violations.push(`${d}: name 欠落`);
        if (!prod.brand || prod.brand["@type"] !== "Brand") violations.push(`${d}: brand 欠落`);
      }
    }
    assert.equal(violations.length, 0,
      `JSON-LD スキーマ違反: ${violations.slice(0, 3).join(" / ")}`);
  });
});
