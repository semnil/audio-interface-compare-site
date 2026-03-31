/**
 * build.js – xlsx → 静的HTML比較サイト生成
 *
 * 処理:
 * 1. data/audio_interfaces.xlsx を読み込み
 * 2. dist/products.json を出力 (クライアント検索用)
 * 3. dist/index.html を出力 (トップページ: 製品選択 + 検索)
 * 4. dist/compare/{slugA}-vs-{slugB}/index.html を全組合せ分出力
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_FILE = join(ROOT, "data", "audio_interfaces.xlsx");
// 出力先: 環境変数 DIST_DIR があればそちらを使用 (CI / ローカルテスト切替用)
const DIST = process.env.DIST_DIR
  ? join(process.env.DIST_DIR)
  : join(ROOT, "dist");

// ベースパス: GitHub Pages のサブディレクトリ対応
// カスタムドメイン → "/"、repo pages → "/repo-name/"
// 末尾スラッシュを保証
const BASE_PATH = (() => {
  let bp = process.env.BASE_PATH || "/";
  if (!bp.endsWith("/")) bp += "/";
  if (!bp.startsWith("/")) bp = "/" + bp;
  return bp;
})();
console.log(`BASE_PATH = "${BASE_PATH}"`);

// ─── Column mapping ────────────────────────────────────────────────────
const COLUMNS = [
  { key: "brand",            label: "ブランド" },
  { key: "model",            label: "モデル名" },
  { key: "category",         label: "カテゴリ" },
  { key: "price",            label: "参考価格 (USD)" },
  { key: "micPre",           label: "マイクプリアンプ数" },
  { key: "comboIn",          label: "Combo入力 (XLR/TRS)" },
  { key: "lineIn",           label: "ライン入力" },
  { key: "hiZ",              label: "Hi-Z入力" },
  { key: "adatIn",           label: "ADAT入力 (ch)" },
  { key: "spdifIn",          label: "S/PDIF入力" },
  { key: "mainOut",          label: "アナログメイン出力" },
  { key: "lineOut",          label: "アナログライン出力" },
  { key: "hpOut",            label: "ヘッドフォン出力" },
  { key: "adatOut",          label: "ADAT出力 (ch)" },
  { key: "spdifOut",         label: "S/PDIF出力" },
  { key: "phantom",          label: "ファンタム電源 (48V)" },
  { key: "sampleRate",       label: "最大サンプリングレート (kHz)" },
  { key: "bitDepth",         label: "最大ビット深度 (bit)" },
  { key: "usb",              label: "USB規格" },
  { key: "midi",             label: "MIDI I/O" },
  { key: "loopback",         label: "ループバック" },
  { key: "dsp",              label: "DSPエフェクト" },
  { key: "directMon",        label: "ダイレクトモニタリング" },
  { key: "gainRange",        label: "プリアンプゲインレンジ (dB)" },
  { key: "drIn",             label: "DR 入力 (dB, A-weighted)" },
  { key: "drOut",            label: "DR 出力 (dB, A-weighted)" },
  { key: "drUnknown",        label: "DR (条件不明/設計値)" },
  { key: "thdnMic",          label: "THD+N マイク入力 (%, 1kHz)" },
  { key: "thdnOut",          label: "THD+N 出力 (%, 1kHz)" },
  { key: "thdnUnknown",      label: "THD+N (条件不明)" },
  { key: "einA",             label: "EIN (dBu, A-weighted)" },
  { key: "einUnknown",       label: "EIN (dBu, 条件不明)" },
  { key: "os",               label: "対応OS" },
  { key: "bundle",           label: "バンドルソフト" },
  { key: "notes",            label: "特記事項" },
  { key: "url",              label: "製品ページURL" },
];

// Spec groups for comparison page layout
const SPEC_GROUPS = [
  {
    title: "基本情報",
    keys: ["category", "price", "os", "usb"],
  },
  {
    title: "入力",
    keys: ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "spdifIn"],
  },
  {
    title: "出力",
    keys: ["mainOut", "lineOut", "hpOut", "adatOut", "spdifOut"],
  },
  {
    title: "機能",
    keys: ["phantom", "midi", "loopback", "dsp", "directMon"],
  },
  {
    title: "オーディオ性能",
    keys: ["sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown", "thdnMic", "thdnOut", "thdnUnknown", "einA", "einUnknown"],
  },
  {
    title: "ソフトウェア・その他",
    keys: ["bundle", "notes"],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────
function slugify(brand, model) {
  return `${brand}-${model}`
    .toLowerCase()
    .replace(/\+/g, "-plus")    // "2+" → "2-plus"
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayValue(val) {
  if (val == null || val === "") return '<span class="na">—</span>';
  return escapeHtml(String(val));
}

// ─── Read xlsx ──────────────────────────────────────────────────────────
function readXlsx() {
  const wb = XLSX.readFile(DATA_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });

  // Map JP header names → internal keys
  const headerMap = {};
  for (const col of COLUMNS) {
    headerMap[col.label] = col.key;
  }

  return raw.map((row) => {
    const obj = {};
    for (const [header, value] of Object.entries(row)) {
      const key = headerMap[header];
      if (key) obj[key] = value;
    }
    obj.slug = slugify(obj.brand, obj.model);
    obj.displayName = `${obj.brand} ${obj.model}`;
    return obj;
  });
}

// ─── Templates ──────────────────────────────────────────────────────────

function htmlHead(title, extra = "") {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>[データ確認中] ${escapeHtml(title)}</title>
<link rel="stylesheet" href="${BASE_PATH}style.css">
${extra}
</head>`;
}

const CSS = `
:root {
  --bg: #f8f9fa;
  --surface: #ffffff;
  --border: #e2e8f0;
  --text: #1a202c;
  --text-secondary: #64748b;
  --accent: #2563eb;
  --accent-light: #eff6ff;
  --green: #16a34a;
  --red: #dc2626;
  --group-header-bg: #f1f5f9;
}
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  margin: 0;
  line-height: 1.6;
}
.container { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 16px 0;
}
header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}
header h1 a {
  color: var(--text);
  text-decoration: none;
}
header .subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 2px;
}
main { padding: 32px 0 64px; }

/* ─ WIP banner ─ */
.wip-banner {
  background: #dc2626;
  color: #fff;
  text-align: center;
  padding: 10px 16px;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

/* ─ Index page ─ */
.selector-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.selector-grid {
  display: grid;
  grid-template-columns: 1fr 60px 1fr;
  gap: 16px;
  align-items: start;
}
.selector-grid .vs {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-secondary);
  padding-top: 42px;
}
.selector-col label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-secondary);
}
.search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
}
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.product-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 320px;
  overflow-y: auto;
  margin-top: 8px;
}
.product-item {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  transition: background 0.1s;
}
.product-item:last-child { border-bottom: none; }
.product-item:hover { background: var(--accent-light); }
.product-item.selected {
  background: var(--accent);
  color: #fff;
}
.product-item .brand { font-weight: 600; }
.product-item .meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 2px;
}
.product-item.selected .meta { color: rgba(255,255,255,0.8); }
.compare-btn-wrap { text-align: center; margin-top: 24px; }
.compare-btn {
  display: inline-block;
  padding: 12px 40px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  transition: background 0.15s;
}
.compare-btn:hover { background: #1d4ed8; }
.compare-btn:disabled { background: #94a3b8; cursor: not-allowed; }

/* ─ Comparison page ─ */
.compare-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 32px;
}
.product-card {
  background: var(--surface);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.product-card h2 {
  font-size: 1.1rem;
  margin: 0 0 4px;
}
.product-card .cat {
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.product-card .price {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
  margin-top: 8px;
}
.product-card .price.no-price { color: var(--text-secondary); font-size: 1rem; }
.product-card .ext-link {
  display: inline-block;
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--accent);
  text-decoration: none;
}
.product-card .ext-link:hover { text-decoration: underline; }

.spec-table-wrap {
  background: var(--surface);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.spec-table { width: 100%; border-collapse: collapse; }
.spec-table .group-header td {
  background: var(--group-header-bg);
  font-weight: 700;
  font-size: 0.85rem;
  padding: 10px 16px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.spec-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  vertical-align: top;
}
.spec-table tr:last-child td { border-bottom: none; }
.spec-table .label-col {
  width: 28%;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}
.spec-table .val-col { width: 36%; }
.spec-table .na { color: #cbd5e1; }
.spec-table .highlight { background: var(--accent-light); font-weight: 600; }

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  font-size: 0.9rem;
  color: var(--accent);
  text-decoration: none;
}
.back-link:hover { text-decoration: underline; }

footer {
  text-align: center;
  padding: 32px 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .selector-grid { grid-template-columns: 1fr; }
  .selector-grid .vs { padding-top: 0; }
  .compare-header { grid-template-columns: 1fr; }
  .spec-table .label-col { width: auto; }
  .spec-table .val-col { width: auto; }
}
`;

function indexPage(products, buildDate) {
  const productJson = JSON.stringify(
    products.map((p) => ({
      slug: p.slug,
      brand: p.brand,
      model: p.model,
      displayName: p.displayName,
      category: p.category || "",
      price: p.price,
    }))
  );

  return `${htmlHead("Audio Interface Comparator")}
<body>
<div class="wip-banner">データ確認中</div>
<header>
  <div class="container">
    <h1>Audio Interface Comparator</h1>
    <div class="subtitle">${products.length} 製品を網羅 — 2つ選んで詳細スペックを比較</div>
  </div>
</header>
<main>
  <div class="container">
    <div class="selector-section">
      <div class="selector-grid">
        <div class="selector-col" id="col-a">
          <label>製品 A</label>
          <input type="text" class="search-input" id="search-a" placeholder="ブランド名・モデル名で検索…" autocomplete="off">
          <div class="product-list" id="list-a"></div>
        </div>
        <div class="vs">VS</div>
        <div class="selector-col" id="col-b">
          <label>製品 B</label>
          <input type="text" class="search-input" id="search-b" placeholder="ブランド名・モデル名で検索…" autocomplete="off">
          <div class="product-list" id="list-b"></div>
        </div>
      </div>
      <div class="compare-btn-wrap">
        <button class="compare-btn" id="compare-btn" disabled>比較する</button>
      </div>
    </div>
  </div>
</main>
<footer>
  <div class="container">
    最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様
  </div>
</footer>
<script>
(function(){
  const BASE_PATH = ${JSON.stringify(BASE_PATH)};
  const PRODUCTS = ${productJson};

  // Lightweight search: split query into tokens, match all tokens against brand+model
  function search(query) {
    if (!query.trim()) return PRODUCTS;
    const tokens = query.toLowerCase().split(/\\s+/).filter(Boolean);
    return PRODUCTS.filter(p => {
      const haystack = (p.brand + " " + p.model).toLowerCase();
      return tokens.every(t => haystack.includes(t));
    });
  }

  const state = { a: null, b: null };

  function renderList(containerId, results, side) {
    const el = document.getElementById(containerId);
    if (results.length === 0) {
      el.innerHTML = '<div style="padding:16px;color:#94a3b8;font-size:0.9rem">該当なし</div>';
      return;
    }
    el.innerHTML = results.map(p => {
      const sel = state[side] === p.slug ? ' selected' : '';
      const priceStr = p.price ? '$' + Number(p.price).toLocaleString() : '';
      return '<div class="product-item' + sel + '" data-slug="' + p.slug + '">'
        + '<span class="brand">' + esc(p.brand) + '</span> ' + esc(p.model)
        + '<div class="meta">' + esc(p.category) + (priceStr ? ' · ' + priceStr : '') + '</div>'
        + '</div>';
    }).join('');

    el.querySelectorAll('.product-item').forEach(item => {
      item.addEventListener('click', () => {
        state[side] = item.dataset.slug;
        // Re-render both to clear opposite if same slug selected
        if (state.a && state.a === state.b) {
          state[side === 'a' ? 'b' : 'a'] = null;
        }
        renderList('list-a', search(document.getElementById('search-a').value), 'a');
        renderList('list-b', search(document.getElementById('search-b').value), 'b');
        updateBtn();
      });
    });
  }

  function updateBtn() {
    const btn = document.getElementById('compare-btn');
    btn.disabled = !(state.a && state.b && state.a !== state.b);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Init
  ['a', 'b'].forEach(side => {
    const input = document.getElementById('search-' + side);
    const listId = 'list-' + side;
    input.addEventListener('input', () => renderList(listId, search(input.value), side));
    renderList(listId, PRODUCTS, side);
  });

  document.getElementById('compare-btn').addEventListener('click', () => {
    if (!state.a || !state.b) return;
    window.location.href = BASE_PATH + 'compare/' + state.a + '-vs-' + state.b + '/';
  });
})();
</script>
</body>
</html>`;
}

function comparePage(a, b, buildDate, totalProducts) {
  const keyToLabel = {};
  for (const col of COLUMNS) keyToLabel[col.key] = col.label;

  function diffClass(key, valA, valB) {
    // Numeric higher-is-better keys
    const higherBetter = ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "spdifIn",
      "mainOut", "lineOut", "hpOut", "adatOut", "spdifOut",
      "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"];
    // Numeric lower-is-better keys  (THD+N percentages – but they are strings with dB)
    // Price: not highlighted (preference depends on buyer)
    if (!higherBetter.includes(key)) return ["", ""];
    const nA = parseFloat(valA), nB = parseFloat(valB);
    if (isNaN(nA) || isNaN(nB) || nA === nB) return ["", ""];
    return nA > nB ? [" highlight", ""] : ["", " highlight"];
  }

  let tableRows = "";
  for (const group of SPEC_GROUPS) {
    tableRows += `<tr class="group-header"><td colspan="3">${escapeHtml(group.title)}</td></tr>\n`;
    for (const key of group.keys) {
      const label = keyToLabel[key] || key;
      const [clsA, clsB] = diffClass(key, a[key], b[key]);
      tableRows += `<tr>
  <td class="label-col">${escapeHtml(label)}</td>
  <td class="val-col${clsA}">${displayValue(a[key])}</td>
  <td class="val-col${clsB}">${displayValue(b[key])}</td>
</tr>\n`;
    }
  }

  const title = `${a.displayName} vs ${b.displayName} — Audio Interface Comparator`;
  const description = `${a.displayName} と ${b.displayName} の詳細仕様を比較。入出力数・オーディオ性能・価格をひと目で確認。`;

  return `${htmlHead(title, `<meta name="description" content="${escapeHtml(description)}">\n<link rel="canonical" href="${BASE_PATH}compare/${a.slug}-vs-${b.slug}/">`)}
<body>
<div class="wip-banner">データ確認中</div>
<header>
  <div class="container">
    <h1><a href="${BASE_PATH}">Audio Interface Comparator</a></h1>
    <div class="subtitle">${totalProducts} 製品を網羅</div>
  </div>
</header>
<main>
  <div class="container">
    <a class="back-link" href="${BASE_PATH}">← 製品選択に戻る</a>

    <div class="compare-header">
      <div class="product-card">
        <h2>${escapeHtml(a.displayName)}</h2>
        <div class="cat">${escapeHtml(a.category || "")}</div>
        ${a.price ? `<div class="price">$${Number(a.price).toLocaleString()}</div>` : '<div class="price no-price">価格情報なし</div>'}
        ${a.url ? `<a class="ext-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">公式製品ページ →</a>` : ""}
      </div>
      <div class="product-card">
        <h2>${escapeHtml(b.displayName)}</h2>
        <div class="cat">${escapeHtml(b.category || "")}</div>
        ${b.price ? `<div class="price">$${Number(b.price).toLocaleString()}</div>` : '<div class="price no-price">価格情報なし</div>'}
        ${b.url ? `<a class="ext-link" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">公式製品ページ →</a>` : ""}
      </div>
    </div>

    <div class="spec-table-wrap">
      <table class="spec-table">
        <thead>
          <tr>
            <td class="label-col" style="font-weight:700">スペック項目</td>
            <td class="val-col" style="font-weight:700">${escapeHtml(a.displayName)}</td>
            <td class="val-col" style="font-weight:700">${escapeHtml(b.displayName)}</td>
          </tr>
        </thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </div>
  </div>
</main>
<footer>
  <div class="container">
    最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様
  </div>
</footer>
</body>
</html>`;
}

// ─── Main build ─────────────────────────────────────────────────────────
function build() {
  console.time("build");
  const products = readXlsx();
  console.log(`Read ${products.length} products`);

  const buildDate = new Date().toISOString().split("T")[0];

  // Clean dist (既存ファイルを削除。rmSync が EPERM で失敗する環境ではスキップ)
  try {
    if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  } catch (e) {
    if (e.code !== "EPERM") throw e;
    console.warn("Warning: could not clean dist/ (EPERM). Building in-place.");
  }
  mkdirSync(DIST, { recursive: true });

  // 1. Shared assets
  writeFileSync(join(DIST, "style.css"), CSS);
  console.log("Wrote style.css");

  const jsonPath = join(DIST, "products.json");
  writeFileSync(jsonPath, JSON.stringify(products, null, 2));
  console.log("Wrote products.json");

  // 2. Index page
  writeFileSync(join(DIST, "index.html"), indexPage(products, buildDate));
  console.log("Wrote index.html");

  // 3. Comparison pages (all C(n,2) combinations)
  const slugMap = new Map();
  for (const p of products) slugMap.set(p.slug, p);

  let pageCount = 0;
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];
      // Generate both directions (a-vs-b and b-vs-a) to preserve user's left/right selection
      for (const [left, right] of [[a, b], [b, a]]) {
        const dir = join(DIST, "compare", `${left.slug}-vs-${right.slug}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, "index.html"),
          comparePage(left, right, buildDate, products.length)
        );
        pageCount++;
      }
      if (pageCount % 4000 === 0) {
        console.log(`  ${pageCount} pages generated…`);
      }
    }
  }

  console.log(`Generated ${pageCount} comparison pages`);
  console.timeEnd("build");
}

build();
