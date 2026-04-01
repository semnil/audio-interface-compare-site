/**
 * build.js – xlsx → 静的HTML比較サイト生成
 *
 * 処理:
 * 1. data/audio_interfaces.xlsx を読み込み
 * 2. dist/products.json を出力 (クライアント検索用)
 * 3. dist/index.html を出力 (トップページ: 製品選択 + 検索)
 * 4. dist/compare/{slugA}-vs-{slugB}/index.html を全組合せ分出力
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setPriority, constants } from "node:os";
import ExcelJS from "exceljs";

// ビルドプロセスの CPU 優先度を下げ、他のアプリケーションへの影響を軽減
try { setPriority(constants.priority.PRIORITY_BELOW_NORMAL); } catch {}


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
  { key: "brand",            label: "Brand",                        labelJa: "ブランド" },
  { key: "model",            label: "Model",                        labelJa: "モデル名" },
  { key: "category",         label: "Category",                     labelJa: "カテゴリ" },
  { key: "price",            label: "Reference Price (USD)",        labelJa: "参考価格 (USD)" },
  { key: "micPre",           label: "Mic Preamps",                  labelJa: "マイクプリアンプ数" },
  { key: "comboIn",          label: "Combo Inputs (XLR/TRS)",       labelJa: "Combo入力 (XLR/TRS)" },
  { key: "lineIn",           label: "Line Inputs",                  labelJa: "ライン入力" },
  { key: "hiZ",              label: "Hi-Z Inputs",                  labelJa: "Hi-Z入力" },
  { key: "adatIn",           label: "ADAT Input (ch@48kHz)",        labelJa: "ADAT入力 (ch@48kHz)" },
  { key: "opticalIn",        label: "Optical Ports (Input)",        labelJa: "光ポート (入力)" },
  { key: "spdifCoaxIn",      label: "S/PDIF (Coax) Input",          labelJa: "S/PDIF (同軸) 入力" },
  { key: "spdifOptIn",       label: "S/PDIF (Optical) Input",       labelJa: "S/PDIF (光) 入力" },
  { key: "aesIn",            label: "AES/EBU Input",                labelJa: "AES/EBU入力" },
  { key: "mainOut",          label: "Analog Main Output",           labelJa: "アナログメイン出力" },
  { key: "lineOut",          label: "Analog Line Output",           labelJa: "アナログライン出力" },
  { key: "hpOut",            label: "Headphone Output",             labelJa: "ヘッドフォン出力" },
  { key: "adatOut",          label: "ADAT Output (ch@48kHz)",       labelJa: "ADAT出力 (ch@48kHz)" },
  { key: "opticalOut",       label: "Optical Ports (Output)",       labelJa: "光ポート (出力)" },
  { key: "spdifCoaxOut",     label: "S/PDIF (Coax) Output",         labelJa: "S/PDIF (同軸) 出力" },
  { key: "spdifOptOut",      label: "S/PDIF (Optical) Output",      labelJa: "S/PDIF (光) 出力" },
  { key: "aesOut",           label: "AES/EBU Output",               labelJa: "AES/EBU出力" },
  { key: "phantom",          label: "Phantom Power (48V)",          labelJa: "ファンタム電源 (48V)" },
  { key: "sampleRate",       label: "Max Sample Rate (kHz)",        labelJa: "最大サンプリングレート (kHz)" },
  { key: "bitDepth",         label: "Max Bit Depth (bit)",          labelJa: "最大ビット深度 (bit)" },
  { key: "usb",              label: "Connection",                   labelJa: "接続規格" },
  { key: "midi",             label: "MIDI I/O",                     labelJa: "MIDI I/O" },
  { key: "loopback",         label: "Loopback",                     labelJa: "ループバック" },
  { key: "dsp",              label: "DSP Effects",                  labelJa: "DSPエフェクト" },
  { key: "directMon",        label: "Direct Monitoring",            labelJa: "ダイレクトモニタリング" },
  { key: "gainRange",        label: "Preamp Gain Range (dB)",       labelJa: "プリアンプゲインレンジ (dB)" },
  { key: "drIn",             label: "DR Input (dB, A-weighted)",    labelJa: "DR 入力 (dB, A-weighted)" },
  { key: "drOut",            label: "DR Output (dB, A-weighted)",   labelJa: "DR 出力 (dB, A-weighted)" },
  { key: "drUnknown",        label: "DR (Unknown Conditions)",      labelJa: "DR (条件不明)" },
  { key: "thdnMic",          label: "THD+N Mic Input (dB(%), 1kHz)", labelJa: "THD+N マイク入力 (dB(%), 1kHz)" },
  { key: "thdnOut",          label: "THD+N Output (dB(%), 1kHz)",   labelJa: "THD+N 出力 (dB(%), 1kHz)" },
  { key: "thdnUnknown",      label: "THD+N (dB(%), Unknown)",       labelJa: "THD+N (dB(%), 条件不明)" },
  { key: "einA",             label: "EIN (dBu, A-weighted)",        labelJa: "EIN (dBu, A-weighted)" },
  { key: "einUnknown",       label: "EIN (dBu, Unknown)",           labelJa: "EIN (dBu, 条件不明)" },
  { key: "os",               label: "Supported OS",                 labelJa: "対応OS" },
  { key: "bundle",           label: "Bundled Software",             labelJa: "バンドルソフト" },
  { key: "notes",            label: "Notes",                        labelJa: "特記事項" },
  { key: "url",              label: "Product Page URL",             labelJa: "製品ページURL" },
];

// Spec groups for comparison page layout
const SPEC_GROUPS = [
  {
    id: "basic",
    title: "General",       titleJa: "基本情報",
    keys: ["category", "price", "os", "usb"],
  },
  {
    id: "input",
    title: "Inputs",        titleJa: "入力",
    keys: ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn"],
  },
  {
    id: "output",
    title: "Outputs",       titleJa: "出力",
    keys: ["mainOut", "lineOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut"],
  },
  {
    id: "features",
    title: "Features",      titleJa: "機能",
    keys: ["phantom", "midi", "loopback", "dsp", "directMon"],
  },
  {
    id: "performance",
    title: "Audio Performance", titleJa: "オーディオ性能",
    keys: ["sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown", "thdnMic", "thdnOut", "thdnUnknown", "einA", "einUnknown"],
  },
  {
    id: "software",
    title: "Software & Other", titleJa: "ソフトウェア・その他",
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

function minifyHtml(html) {
  return html
    .replace(/\n\s*/g, "\n")       // collapse indentation
    .replace(/>\s*\n\s*</g, "><")  // remove whitespace between tags
    .replace(/\n+/g, "\n")         // collapse multiple newlines
    .trim();
}

// ─── Read xlsx ──────────────────────────────────────────────────────────
async function readXlsx() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DATA_FILE);
  const ws = wb.worksheets[0];

  // 1行目をヘッダーとして読み取り
  const headerRow = ws.getRow(1);
  const headerMap = {}; // colNumber → internal key
  headerRow.eachCell((cell, colNumber) => {
    const label = String(cell.value).trim();
    const col = COLUMNS.find((c) => c.label === label);
    if (col) headerMap[colNumber] = col.key;
  });

  // 2行目以降をデータとして読み取り
  const products = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell((cell, colNumber) => {
      const key = headerMap[colNumber];
      if (key) obj[key] = cell.value;
    });
    if (!obj.brand || !obj.model) return;
    obj.slug = slugify(obj.brand, obj.model);
    obj.displayName = `${obj.brand} ${obj.model}`;
    products.push(obj);
  });
  return products;
}

// ─── Templates ──────────────────────────────────────────────────────────

function htmlHead(title, extra = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>[Under Review] ${escapeHtml(title)}</title>
<link rel="stylesheet" href="${BASE_PATH}style.css">
${extra}
</head>`;
}

// Shared i18n script (written to dist/i18n.js)
// PAGE_JA is expected to be set by each page before loading this script
const I18N_JS = `(function(){
if(!/^ja\\b/.test(navigator.language))return;
document.documentElement.lang='ja';
var ja=Object.assign({wip:'内容精査中',aiDisclaimer:'スペック情報は AI を活用して収集しており、誤りが含まれる可能性があります。正確な情報は各メーカー公式サイトをご確認ください。',backLink:'← 製品選択に戻る',noPrice:'価格情報なし',productPage:'公式製品ページ →',specLabel:'スペック項目'},typeof PAGE_JA!=='undefined'?PAGE_JA:{});
document.title=document.title.replace('[Under Review]','[内容精査中]');
document.querySelectorAll('[data-i18n]').forEach(function(el){var k=el.getAttribute('data-i18n');if(ja[k])el.textContent=ja[k];});
document.querySelectorAll('[data-i18n-content]').forEach(function(el){var v=el.getAttribute('data-i18n-val');if(v)el.setAttribute('content',v);});
document.querySelectorAll('[data-i18n-label]').forEach(function(el){el.textContent=el.getAttribute('data-i18n-label');});
document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){var k=el.getAttribute('data-i18n-placeholder');if(ja[k])el.placeholder=ja[k];});
})();`;

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
.ai-disclaimer {
  background: #fef3c7;
  color: #92400e;
  text-align: center;
  padding: 8px 16px;
  font-size: 0.85rem;
  line-height: 1.5;
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
.product-item:hover:not(.disabled) { background: var(--accent-light); }
.product-item.selected {
  background: var(--accent);
  color: #fff;
}
.product-item.disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
.spec-table .group-header a {
  color: inherit;
  text-decoration: none;
}
.spec-table .group-header a:hover {
  text-decoration: underline;
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
<div class="wip-banner" data-i18n="wip">Under Review</div>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container">
    <h1>Audio Interface Comparator</h1>
    <div class="subtitle" data-i18n="subtitle">${products.length} products — Select two to compare specs</div>
  </div>
</header>
<main>
  <div class="container">
    <div class="selector-section">
      <div class="selector-grid">
        <div class="selector-col" id="col-a">
          <label data-i18n="productA">Product A</label>
          <input type="text" class="search-input" id="search-a" data-i18n-placeholder="searchPlaceholder" placeholder="Search by brand or model…" autocomplete="off">
          <div class="product-list" id="list-a"></div>
        </div>
        <div class="vs">VS</div>
        <div class="selector-col" id="col-b">
          <label data-i18n="productB">Product B</label>
          <input type="text" class="search-input" id="search-b" data-i18n-placeholder="searchPlaceholder" placeholder="Search by brand or model…" autocomplete="off">
          <div class="product-list" id="list-b"></div>
        </div>
      </div>
      <div class="compare-btn-wrap">
        <button class="compare-btn" id="compare-btn" disabled data-i18n="compareBtn">Compare</button>
      </div>
    </div>
  </div>
</main>
<footer>
  <div class="container" data-i18n="footer">
    Last updated: ${escapeHtml(buildDate)} — Source: Official manufacturer specs
  </div>
</footer>
<script>
(function(){
  const BASE_PATH = ${JSON.stringify(BASE_PATH)};
  const PRODUCTS = ${productJson};
  const isJa = /^ja\\b/.test(navigator.language);

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
      el.innerHTML = '<div style="padding:16px;color:#94a3b8;font-size:0.9rem">' + (isJa ? '該当なし' : 'No results') + '</div>';
      return;
    }
    var otherSide = side === 'a' ? 'b' : 'a';
    el.innerHTML = results.map(p => {
      var sel = state[side] === p.slug ? ' selected' : '';
      var dis = state[otherSide] === p.slug ? ' disabled' : '';
      var priceStr = p.price ? '$' + Number(p.price).toLocaleString() : '';
      return '<div class="product-item' + sel + dis + '" data-slug="' + p.slug + '">'
        + '<span class="brand">' + esc(p.brand) + '</span> ' + esc(p.model)
        + '<div class="meta">' + esc(p.category) + (priceStr ? ' · ' + priceStr : '') + '</div>'
        + '</div>';
    }).join('');

    el.querySelectorAll('.product-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        state[side] = item.dataset.slug;
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
<script>var PAGE_JA={subtitle:'全 ${products.length} 製品 — 2つ選んで詳細スペックを比較',productA:'製品 A',productB:'製品 B',searchPlaceholder:'ブランド名・モデル名で検索…',compareBtn:'比較する',footer:'最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様'};</script>
<script src="${BASE_PATH}i18n.js"></script>
</body>
</html>`;
}

function comparePage(a, b, buildDate, totalProducts) {
  const keyToLabel = {};
  const keyToLabelJa = {};
  for (const col of COLUMNS) {
    keyToLabel[col.key] = col.label;
    keyToLabelJa[col.key] = col.labelJa;
  }

  function diffClass(key, valA, valB) {
    const higherBetter = ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn",
      "mainOut", "lineOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut",
      "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"];
    const lowerBetter = ["thdnMic", "thdnOut", "thdnUnknown"];
    // Price: not highlighted (preference depends on buyer)
    if (!higherBetter.includes(key) && !lowerBetter.includes(key)) return ["", ""];
    const nA = parseFloat(valA), nB = parseFloat(valB);
    if (isNaN(nA) && isNaN(nB)) return ["", ""];
    if (isNaN(nA)) return ["", " highlight"];
    if (isNaN(nB)) return [" highlight", ""];
    if (nA === nB) return ["", ""];
    const aWins = lowerBetter.includes(key) ? nA < nB : nA > nB;
    return aWins ? [" highlight", ""] : ["", " highlight"];
  }

  let tableRows = "";
  for (const group of SPEC_GROUPS) {
    tableRows += `<tr class="group-header" id="${group.id}"><td colspan="3"><a href="#${group.id}" data-i18n-label="${escapeHtml(group.titleJa)}">${escapeHtml(group.title)}</a></td></tr>\n`;
    for (const key of group.keys) {
      const label = keyToLabel[key] || key;
      const labelJa = keyToLabelJa[key] || label;
      const [clsA, clsB] = diffClass(key, a[key], b[key]);
      tableRows += `<tr>
  <td class="label-col" data-i18n-label="${escapeHtml(labelJa)}">${escapeHtml(label)}</td>
  <td class="val-col${clsA}">${displayValue(a[key])}</td>
  <td class="val-col${clsB}">${displayValue(b[key])}</td>
</tr>\n`;
    }
  }

  const title = `${a.displayName} vs ${b.displayName} — Audio Interface Comparator`;
  const descEn = `Compare ${a.displayName} and ${b.displayName} specs side by side. I/O count, audio performance, and price at a glance.`;
  const descJa = `${a.displayName} と ${b.displayName} の詳細仕様を比較。入出力数・オーディオ性能・価格をひと目で確認。`;

  function productJsonLd(p) {
    const obj = { "@type": "Product", name: p.displayName };
    if (p.brand) obj.brand = { "@type": "Brand", name: p.brand };
    return obj;
  }
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    about: [productJsonLd(a), productJsonLd(b)],
  });

  return `${htmlHead(title, `<meta name="description" content="${escapeHtml(descEn)}" data-i18n-content="metaDesc" data-i18n-val="${escapeHtml(descJa)}">\n<link rel="canonical" href="${BASE_PATH}compare/${a.slug}-vs-${b.slug}/">\n<script type="application/ld+json">${jsonLd}</script>`)}
<body>
<div class="wip-banner" data-i18n="wip">Under Review</div>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container">
    <h1>${escapeHtml(a.displayName)} vs ${escapeHtml(b.displayName)}</h1>
    <div class="subtitle"><a href="${BASE_PATH}" style="color:inherit;text-decoration:none">Audio Interface Comparator</a> — <span data-i18n="subtitleCompare">${totalProducts} products covered</span></div>
  </div>
</header>
<main>
  <div class="container">
    <a class="back-link" href="${BASE_PATH}" data-i18n="backLink">← Back to product selection</a>

    <div class="compare-header">
      <div class="product-card">
        <h2>${escapeHtml(a.displayName)}</h2>
        <div class="cat">${escapeHtml(a.category || "")}</div>
        ${a.price ? `<div class="price">$${Number(a.price).toLocaleString()}</div>` : '<div class="price no-price" data-i18n="noPrice">No price info</div>'}
        ${a.url ? `<a class="ext-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" data-i18n="productPage">Official product page →</a>` : ""}
      </div>
      <div class="product-card">
        <h2>${escapeHtml(b.displayName)}</h2>
        <div class="cat">${escapeHtml(b.category || "")}</div>
        ${b.price ? `<div class="price">$${Number(b.price).toLocaleString()}</div>` : '<div class="price no-price" data-i18n="noPrice">No price info</div>'}
        ${b.url ? `<a class="ext-link" href="${escapeHtml(b.url)}" target="_blank" rel="noopener" data-i18n="productPage">Official product page →</a>` : ""}
      </div>
    </div>

    <div class="spec-table-wrap">
      <table class="spec-table">
        <thead>
          <tr>
            <td class="label-col" style="font-weight:700" data-i18n="specLabel">Spec</td>
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
  <div class="container" data-i18n="footer">
    Last updated: ${escapeHtml(buildDate)} — Source: Official manufacturer specs
  </div>
</footer>
<script>var PAGE_JA={subtitleCompare:'${totalProducts} 製品を網羅',footer:'最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様'};</script>
<script src="${BASE_PATH}i18n.js"></script>
</body>
</html>`;
}

// ─── Main build ─────────────────────────────────────────────────────────
async function build() {
  console.time("build");
  const products = await readXlsx();
  console.log(`Read ${products.length} products`);

  const buildDate = new Date().toISOString().split("T")[0];

  // Clean dist (既存ファイルを削除。OneDrive 等でロックされる場合はリトライ/スキップ)
  if (existsSync(DIST)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        rmSync(DIST, { recursive: true, force: true });
        break;
      } catch (e) {
        if (attempt === 2) {
          console.warn("Warning: could not clean dist/. Building in-place.");
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }
  mkdirSync(DIST, { recursive: true });

  // 1. Shared assets
  writeFileSync(join(DIST, "style.css"), CSS);
  console.log("Wrote style.css");

  writeFileSync(join(DIST, "i18n.js"), I18N_JS);
  console.log("Wrote i18n.js");

  // CNAME file for custom domain (GitHub Pages)
  const customDomain = process.env.CUSTOM_DOMAIN;
  if (customDomain) {
    writeFileSync(join(DIST, "CNAME"), customDomain);
    console.log(`Wrote CNAME (${customDomain})`);
  }

  const jsonPath = join(DIST, "products.json");
  writeFileSync(jsonPath, JSON.stringify(products, null, 2));
  console.log("Wrote products.json");

  // 2. Index page
  writeFileSync(join(DIST, "index.html"), minifyHtml(indexPage(products, buildDate)));
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
          minifyHtml(comparePage(left, right, buildDate, products.length))
        );
        pageCount++;
      }
      if (pageCount % 4000 === 0) {
        console.log(`  ${pageCount} pages generated…`);
      }
    }
  }

  console.log(`Generated ${pageCount} comparison pages`);

  // 4. sitemap.xml (canonical pages only: index + alphabetically ordered comparisons)
  const siteUrl = process.env.SITE_URL || `https://semnil.github.io/audio-interface-compare-site`;
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  sitemap += `  <url><loc>${siteUrl}${BASE_PATH}</loc><changefreq>monthly</changefreq></url>\n`;
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const [sa, sb] = products[i].slug < products[j].slug
        ? [products[i].slug, products[j].slug]
        : [products[j].slug, products[i].slug];
      sitemap += `  <url><loc>${siteUrl}${BASE_PATH}compare/${sa}-vs-${sb}/</loc></url>\n`;
    }
  }
  sitemap += `</urlset>\n`;
  writeFileSync(join(DIST, "sitemap.xml"), sitemap);
  console.log(`Wrote sitemap.xml (${products.length * (products.length - 1) / 2 + 1} URLs)`);

  console.timeEnd("build");
}

build();
