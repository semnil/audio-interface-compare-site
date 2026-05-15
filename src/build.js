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
import { fileURLToPath, pathToFileURL } from "node:url";
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
// 末尾スラッシュを保証 + 前後空白除去 + 連続スラッシュ畳み込み
const BASE_PATH = (() => {
  let bp = (process.env.BASE_PATH || "/").trim();
  if (bp === "") bp = "/";
  if (!bp.endsWith("/")) bp += "/";
  if (!bp.startsWith("/")) bp = "/" + bp;
  bp = bp.replace(/\/+/g, "/");
  return bp;
})();
console.log(`BASE_PATH = "${BASE_PATH}"`);

// サイト URL: OGP / canonical 用の絶対 URL ベース
const SITE_URL = process.env.SITE_URL || "https://semnil.github.io/audio-interface-compare-site";

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
  if (val == null || val === "") return '<span class="na" aria-label="No data">—</span>';
  return escapeHtml(String(val));
}

// <script> タグ内への JSON 埋め込み向けに、</script> 脱出と U+2028/U+2029 をエスケープ
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// JSON-LD (application/ld+json) 埋め込み向け。上記に加え & も \u0026 にエスケープする
function safeJsonForScriptLD(obj) {
  return safeJsonForScript(obj).replace(/&/g, "\\u0026");
}

// 外部 URL を http(s) スキームに限定してサニタイズ。不正なら空文字を返す
function sanitizeUrl(u) {
  if (u == null) return "";
  const s = String(u).trim();
  if (!s) return "";
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return "";
  } catch (_) {
    return "";
  }
}

function minifyHtml(html) {
  return html
    .replace(/\n\s*/g, "\n")       // collapse indentation
    .replace(/>\s*\n\s*</g, "><")  // remove whitespace between tags
    .replace(/\n+/g, "\n")         // collapse multiple newlines
    .trim();
}

// ─── Favicon ICO generation ─────────────────────────────────────────────
function generateFaviconIco() {
  // Rasterize the D4 design at 32x32 and 16x16, pack into ICO (BMP format)
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(c1, c2, t) {
    return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  }

  const bgTL = hexToRgb("#1e1b4b");
  const bgBR = hexToRgb("#0f172a");
  const bars = [
    { x: 10, y: 16, w: 10, h: 32, r: 3, color: hexToRgb("#3b82f6") },
    { x: 24, y: 24, w: 10, h: 24, r: 3, color: hexToRgb("#818cf8") },
    { x: 38, y: 12, w: 10, h: 36, r: 3, color: hexToRgb("#a855f7") },
  ];

  function rasterize(size) {
    const s = size / 64;
    const pixels = Buffer.alloc(size * size * 4);
    const bgRx = 14 * s;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // Gradient background
        const t = (x + y) / (2 * (size - 1));
        let [r, g, b] = lerpColor(bgTL, bgBR, t);
        let a = 255;

        // Rounded rect mask for background
        const inBg = isInRoundedRect(x, y, 0, 0, size, size, bgRx);
        if (!inBg) { a = 0; r = g = b = 0; }

        // Draw bars
        if (inBg) {
          for (const bar of bars) {
            const bx = bar.x * s, by = bar.y * s;
            const bw = bar.w * s, bh = bar.h * s;
            const br = bar.r * s;
            if (isInRoundedRect(x, y, bx, by, bw, bh, br)) {
              [r, g, b] = bar.color;
            }
          }
        }

        pixels[i]     = Math.round(r);
        pixels[i + 1] = Math.round(g);
        pixels[i + 2] = Math.round(b);
        pixels[i + 3] = a;
      }
    }
    return pixels;
  }

  function isInRoundedRect(px, py, rx, ry, rw, rh, rr) {
    if (px < rx || px >= rx + rw || py < ry || py >= ry + rh) return false;
    // Check corners
    const corners = [
      [rx + rr, ry + rr],
      [rx + rw - rr, ry + rr],
      [rx + rr, ry + rh - rr],
      [rx + rw - rr, ry + rh - rr],
    ];
    for (const [cx, cy] of corners) {
      const inCornerZone =
        (px < rx + rr || px >= rx + rw - rr) &&
        (py < ry + rr || py >= ry + rh - rr);
      if (inCornerZone) {
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy > rr * rr) return false;
      }
    }
    return true;
  }

  function makeBmpEntry(size, pixels) {
    // BITMAPINFOHEADER (40 bytes) + pixel data (bottom-up BGRA) + AND mask
    const rowBytes = size * 4;
    const andRowBytes = Math.ceil(size / 32) * 4;
    const andSize = andRowBytes * size;
    const dataSize = 40 + rowBytes * size + andSize;
    const buf = Buffer.alloc(dataSize);

    // BITMAPINFOHEADER
    buf.writeUInt32LE(40, 0);             // biSize
    buf.writeInt32LE(size, 4);            // biWidth
    buf.writeInt32LE(size * 2, 8);        // biHeight (doubled for ICO)
    buf.writeUInt16LE(1, 12);             // biPlanes
    buf.writeUInt16LE(32, 14);            // biBitCount
    buf.writeUInt32LE(0, 16);             // biCompression
    buf.writeUInt32LE(rowBytes * size + andSize, 20); // biSizeImage

    // Pixel data (bottom-up, BGRA)
    for (let y = 0; y < size; y++) {
      const srcRow = (size - 1 - y) * size * 4;
      const dstRow = 40 + y * rowBytes;
      for (let x = 0; x < size; x++) {
        const si = srcRow + x * 4;
        const di = dstRow + x * 4;
        buf[di]     = pixels[si + 2]; // B
        buf[di + 1] = pixels[si + 1]; // G
        buf[di + 2] = pixels[si];     // R
        buf[di + 3] = pixels[si + 3]; // A
      }
    }

    // AND mask (all 0 = fully opaque, alpha channel handles transparency)
    // Already zero-filled by Buffer.alloc

    return buf;
  }

  const sizes = [16, 32, 48];
  const entries = sizes.map(sz => ({ size: sz, data: makeBmpEntry(sz, rasterize(sz)) }));

  // ICO file: header + directory + image data
  const headerSize = 6;
  const dirSize = 16 * entries.length;
  let offset = headerSize + dirSize;
  const parts = [Buffer.alloc(headerSize + dirSize)];
  const header = parts[0];

  // ICONDIR
  header.writeUInt16LE(0, 0);               // reserved
  header.writeUInt16LE(1, 2);               // type (1=ICO)
  header.writeUInt16LE(entries.length, 4);  // count

  entries.forEach((entry, i) => {
    const pos = 6 + i * 16;
    header[pos]     = entry.size < 256 ? entry.size : 0; // width
    header[pos + 1] = entry.size < 256 ? entry.size : 0; // height
    header[pos + 2] = 0;   // color palette
    header[pos + 3] = 0;   // reserved
    header.writeUInt16LE(1, pos + 4);   // color planes
    header.writeUInt16LE(32, pos + 6);  // bits per pixel
    header.writeUInt32LE(entry.data.length, pos + 8);  // data size
    header.writeUInt32LE(offset, pos + 12);            // data offset
    offset += entry.data.length;
    parts.push(entry.data);
  });

  return Buffer.concat(parts);
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

function htmlHead(title, extra = "", ogp = null) {
  const ogpTags = ogp ? (() => {
    const t = escapeHtml(ogp.title || title);
    const d = escapeHtml(ogp.description || "");
    const u = escapeHtml(ogp.url || SITE_URL + BASE_PATH);
    return `
<meta property="og:type" content="${ogp.type || "website"}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:site_name" content="Audio Interface Comparator">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">`;
  })() : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="google-site-verification" content="O6oFrJyEg-Om0e19Q1QZpGG3DeKfy0ggL_tQWnAaWgI" />${ogpTags}
<link rel="icon" href="${BASE_PATH}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${BASE_PATH}favicon.ico" sizes="48x48">
<link rel="stylesheet" href="${BASE_PATH}style.css">
${extra}
</head>`;
}

// Shared i18n script (written to dist/i18n.js)
// PAGE_JA is expected to be set by each page before loading this script
const I18N_JS = `(function(){
if(!/^ja\\b/.test(navigator.language))return;
document.documentElement.lang='ja';
var ja=Object.assign({aiDisclaimer:'スペック情報は AI を活用して収集しており、誤りが含まれる可能性があります。正確な情報は各メーカー公式サイトをご確認ください。',backLink:'← 製品選択に戻る',noPrice:'価格情報なし',productPage:'公式製品ページ →',specLabel:'スペック項目',reportIssue:'問題を報告'},typeof PAGE_JA!=='undefined'?PAGE_JA:{});
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
}
.skip-link:focus {
  left: 8px;
  top: 8px;
  background: #fff;
  padding: 8px 12px;
  z-index: 100;
  border: 2px solid var(--accent);
  text-decoration: none;
  color: var(--text);
}
.noscript-warning {
  padding: 16px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 8px;
  margin-bottom: 16px;
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
  font-size: 1rem;
  outline: none;
  font-family: inherit;
}
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.4); }
.compare-btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.product-item:focus-visible { outline: 3px solid var(--accent); outline-offset: -2px; }
/* 選択済み項目は accent 背景なので、白い内リングで focus ring を可視化する */
.product-item.selected:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px #fff, 0 0 0 3px var(--accent);
}
.product-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 320px;
  overflow-y: auto;
  margin-top: 8px;
}
.product-item-wrap {
  position: relative;
  border-bottom: 1px solid var(--border);
}
.product-item-wrap:last-child { border-bottom: none; }
.product-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  padding: 10px 44px 10px 14px;
  cursor: pointer;
  font-size: 0.9rem;
  font-family: inherit;
  transition: background 0.1s;
}
.specs-link {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0.6;
  transition: opacity 0.1s, background 0.1s;
}
.product-item-wrap:hover .specs-link,
.product-item.selected ~ .specs-link { opacity: 1; }
.product-item.selected ~ .specs-link { color: #fff; }
.specs-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; opacity: 1; }
.product-item:hover:not(:disabled) { background: var(--accent-light); }
.product-item.selected {
  background: var(--accent);
  color: #fff;
}
.product-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.product-item .brand { font-weight: 600; }
.product-item .meta {
  font-size: 0.8rem;
  /* accent-light hover 背景 (#eff6ff) 上 5.6:1 / 白地 6.53:1 のコントラストを確保 */
  color: #475569;
  margin-top: 2px;
}
.product-item.selected .meta { color: rgba(255,255,255,0.85); }
.compare-btn-wrap { text-align: center; margin-top: 24px; }
.compare-btn {
  display: inline-block;
  padding: 14px 40px;
  min-height: 44px;
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
.compare-btn:disabled { background: #64748b; cursor: not-allowed; }
.compare-hint {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

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
  -webkit-overflow-scrolling: touch;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.spec-table { width: 100%; border-collapse: collapse; }
.spec-table .group-header td {
  background: var(--group-header-bg);
  font-weight: 700;
  font-size: 0.85rem;
  padding: 10px 16px;
  color: var(--text);
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
.spec-table .group-header a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.spec-table td,
.spec-table th.label-col {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  vertical-align: top;
}
.spec-table tr:last-child td,
.spec-table tr:last-child th.label-col { border-bottom: none; }
.spec-table .label-col {
  width: 28%;
  font-weight: 500;
  color: var(--text-secondary);
  text-align: left;
  white-space: nowrap;
}
.spec-table .val-col { width: 36%; }
.spec-table thead th { background: #f8fafc; }
/* #94a3b8 は白地に対して 3.03:1 — 装飾用途として十分な可読性 */
.spec-table .na { color: #94a3b8; }
.spec-table .highlight { background: var(--accent-light); font-weight: 600; }
.spec-table .highlight .hl-mark {
  margin-left: 6px;
  color: var(--green);
  font-weight: 700;
}

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
  /* body bg (#f8f9fa) 上で 6.16:1 のコントラスト (WCAG AA 準拠) */
  color: #475569;
}
footer a { color: #475569; }
footer a:hover { color: var(--accent); }

@media (max-width: 768px) {
  .selector-grid { grid-template-columns: 1fr; }
  .selector-grid .vs { padding-top: 0; }
  .compare-header { grid-template-columns: 1fr; }
  .spec-table .label-col { width: auto; }
  .spec-table .val-col { width: auto; }
  .spec-table-wrap {
    overflow-x: auto;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), inset -12px 0 8px -8px rgba(0,0,0,0.12);
  }
  .spec-table th.label-col,
  .spec-table thead th:first-child {
    position: sticky;
    left: 0;
    background: var(--surface);
    z-index: 1;
  }
}

/* ─ Product page ─ */
.compare-links-heading {
  font-size: 1.1rem;
  margin: 48px 0 16px;
}
.compare-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}
.compare-links li a {
  display: block;
  padding: 10px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  text-decoration: none;
  color: var(--accent);
  font-size: 0.9rem;
  transition: border-color 0.1s, background 0.1s;
}
.compare-links li a:hover { border-color: var(--accent); background: var(--accent-light); }
.compare-links li a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.compare-links .brand { font-weight: 600; }
.compare-links .meta { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; }

/* 減速モーションを好むユーザーのために transition / animation を最小化 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;

function indexPage(products, buildDate) {
  const productJson = safeJsonForScript(
    products.map((p) => ({
      slug: p.slug,
      brand: p.brand,
      model: p.model,
      displayName: p.displayName,
      category: p.category || "",
      price: p.price,
    }))
  );

  const ogp = {
    type: "website",
    title: "Audio Interface Comparator",
    description: `Compare specs of ${products.length} audio interfaces side by side — inputs, outputs, audio performance, and price.`,
    url: `${SITE_URL}${BASE_PATH}`,
  };
  const canonicalTag = `<link rel="canonical" href="${SITE_URL}${BASE_PATH}">`;
  return `${htmlHead("Audio Interface Comparator", canonicalTag, ogp)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container">
    <h1>Audio Interface Comparator</h1>
    <div class="subtitle" data-i18n="subtitle">${products.length} products — Select two to compare specs</div>
  </div>
</header>
<main id="main">
  <div class="container">
    <noscript><p class="noscript-warning">JavaScript is required to select products. Browse the <a href="${BASE_PATH}sitemap.xml">sitemap</a> to reach specific comparisons.</p></noscript>
    <div class="selector-section">
      <div class="selector-grid">
        <div class="selector-col" id="col-a">
          <label for="search-a" data-i18n="productA">Product A</label>
          <input type="search" class="search-input" id="search-a" role="combobox" aria-controls="list-a" aria-autocomplete="list" aria-expanded="true" data-i18n-placeholder="searchPlaceholder" placeholder="Search by brand or model…" autocomplete="off">
          <div class="product-list" id="list-a" role="listbox" aria-label="Product A" tabindex="-1"></div>
        </div>
        <div class="vs" aria-hidden="true">VS</div>
        <div class="selector-col" id="col-b">
          <label for="search-b" data-i18n="productB">Product B</label>
          <input type="search" class="search-input" id="search-b" role="combobox" aria-controls="list-b" aria-autocomplete="list" aria-expanded="true" data-i18n-placeholder="searchPlaceholder" placeholder="Search by brand or model…" autocomplete="off">
          <div class="product-list" id="list-b" role="listbox" aria-label="Product B" tabindex="-1"></div>
        </div>
      </div>
      <div aria-live="polite" class="sr-only" id="selection-status"></div>
      <div aria-live="polite" class="sr-only" id="search-results-status"></div>
      <div class="compare-btn-wrap">
        <button class="compare-btn" id="compare-btn" disabled data-i18n="compareBtn">Compare</button>
        <p class="compare-hint" id="compare-hint" data-i18n="compareHint">Select Product A and Product B</p>
      </div>
    </div>
  </div>
</main>
<footer>
  <div class="container">
    <span data-i18n="footer">Last updated: ${escapeHtml(buildDate)} — Source: Official manufacturer specs</span>
    <br><a href="https://github.com/semnil/audio-interface-compare-site/issues" target="_blank" rel="noopener noreferrer" data-i18n="reportIssue">Report an issue</a>
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
  // listbox ごとの現在フォーカス中 option (aria-activedescendant 管理)
  const activeIdx = { a: -1, b: -1 };
  const lastResults = { a: [], b: [] };

  function optionId(side, slug) {
    return 'opt-' + side + '-' + slug;
  }

  function renderList(containerId, results, side) {
    const el = document.getElementById(containerId);
    // 再描画前のアクティブ slug を保持し、絞り込み後に同一製品を追跡して idx を振り直す
    const prevResults = lastResults[side];
    const prevIdx = activeIdx[side];
    const prevSlug = (prevIdx >= 0 && prevResults && prevResults[prevIdx]) ? prevResults[prevIdx].slug : null;
    lastResults[side] = results;
    if (results.length === 0) {
      // role="presentation" にして listbox の option 数から除外 (aria-live で別途 0 件アナウンス)
      el.innerHTML = '<div role="presentation" style="padding:16px;color:#64748b;font-size:0.9rem">' + (isJa ? '該当なし' : 'No results') + '</div>';
      activeIdx[side] = -1;
      syncActiveDescendant(side);
      return;
    }
    var otherSide = side === 'a' ? 'b' : 'a';
    el.innerHTML = results.map(p => {
      var sel = state[side] === p.slug ? ' selected' : '';
      var isDisabled = state[otherSide] === p.slug;
      // button 要素の disabled 属性があれば SR は disabled 状態を正しく読むため aria-disabled は重複
      var ariaSel = sel ? ' aria-selected="true"' : ' aria-selected="false"';
      var priceStr = p.price ? '$' + Number(p.price).toLocaleString('en-US') : '';
      var specsLabel = isJa ? '仕様 ↗' : 'Specs ↗';
      var specsHref = BASE_PATH + 'products/' + p.slug + '/';
      return '<div class="product-item-wrap">'
        + '<button type="button" role="option" class="product-item' + sel + '" id="' + optionId(side, p.slug) + '" tabindex="-1"' + (isDisabled ? ' disabled' : '') + ariaSel + ' data-slug="' + p.slug + '">'
        + '<span class="brand">' + esc(p.brand) + '</span> ' + esc(p.model)
        + '<div class="meta">' + esc(p.category) + (priceStr ? ' · ' + priceStr : '') + '</div>'
        + '</button>'
        + '<a class="specs-link" href="' + specsHref + '" tabindex="-1" aria-label="' + esc(p.brand) + ' ' + esc(p.model) + ' specs page">' + specsLabel + '</a>'
        + '</div>';
    }).join('');

    el.querySelectorAll('.product-item:not(:disabled)').forEach(item => {
      item.addEventListener('click', () => selectItem(item, side));
    });
    el.querySelectorAll('.specs-link').forEach(link => {
      link.addEventListener('click', e => e.stopPropagation());
    });
    // 絞り込み後も以前のアクティブ製品が残っていればその新 idx を追跡、なければクリア
    if (prevSlug) {
      var newIdx = -1;
      for (var i = 0; i < results.length; i++) {
        if (results[i].slug === prevSlug) { newIdx = i; break; }
      }
      activeIdx[side] = newIdx;
    } else if (activeIdx[side] >= results.length) {
      activeIdx[side] = -1;
    }
    syncActiveDescendant(side);
  }

  function syncActiveDescendant(side) {
    // WAI-ARIA APG Combobox パターン準拠: aria-activedescendant は focusable な input 側に付ける
    const inputEl = document.getElementById('search-' + side);
    const idx = activeIdx[side];
    const results = lastResults[side];
    if (idx >= 0 && idx < results.length) {
      inputEl.setAttribute('aria-activedescendant', optionId(side, results[idx].slug));
    } else {
      inputEl.removeAttribute('aria-activedescendant');
    }
  }

  function isOptionDisabled(side, idx) {
    const results = lastResults[side];
    if (idx < 0 || idx >= results.length) return true;
    const otherSide = side === 'a' ? 'b' : 'a';
    return state[otherSide] === results[idx].slug;
  }

  function moveActive(side, delta) {
    const results = lastResults[side];
    if (results.length === 0) return;
    const step = delta > 0 ? 1 : -1;
    let idx = activeIdx[side];
    if (idx < 0) {
      idx = step > 0 ? 0 : results.length - 1;
    } else {
      idx = idx + step;
    }
    // 端まで disabled だけが続く場合は wrap せずに停止する
    while (idx >= 0 && idx < results.length && isOptionDisabled(side, idx)) {
      idx += step;
    }
    if (idx < 0 || idx >= results.length) return; // 有効な option が見つからなければ現状維持
    activeIdx[side] = idx;
    syncActiveDescendant(side);
    scrollActiveIntoView(side);
  }

  function setActive(side, idx) {
    const results = lastResults[side];
    if (idx < 0 || idx >= results.length) return;
    // disabled 先頭/末尾を飛ばして最初の有効 option を選ぶ
    if (isOptionDisabled(side, idx)) {
      const step = idx === 0 ? 1 : -1;
      let i = idx + step;
      while (i >= 0 && i < results.length && isOptionDisabled(side, i)) i += step;
      if (i < 0 || i >= results.length) return;
      idx = i;
    }
    activeIdx[side] = idx;
    syncActiveDescendant(side);
    scrollActiveIntoView(side);
  }

  function scrollActiveIntoView(side) {
    const idx = activeIdx[side];
    const results = lastResults[side];
    if (idx < 0 || idx >= results.length) return;
    const id = optionId(side, results[idx].slug);
    const opt = document.getElementById(id);
    if (opt && opt.scrollIntoView) opt.scrollIntoView({ block: 'nearest' });
  }

  function activateCurrent(side) {
    const idx = activeIdx[side];
    const results = lastResults[side];
    if (idx < 0 || idx >= results.length) return;
    const slug = results[idx].slug;
    const otherSide = side === 'a' ? 'b' : 'a';
    if (state[otherSide] === slug) return; // 他方で選択済みなら無視
    const opt = document.getElementById(optionId(side, slug));
    if (opt) selectItem(opt, side);
  }

  function selectItem(item, side) {
    state[side] = item.dataset.slug;
    var p = PRODUCTS.find(x => x.slug === state[side]);
    var status = document.getElementById('selection-status');
    if (status && p) {
      var sideLabel = isJa ? (side === 'a' ? '製品 A' : '製品 B')
                           : (side === 'a' ? 'Product A' : 'Product B');
      status.textContent = sideLabel + ': ' + p.displayName + (isJa ? ' を選択' : ' selected');
    }
    renderList('list-a', search(document.getElementById('search-a').value), 'a');
    renderList('list-b', search(document.getElementById('search-b').value), 'b');
    updateBtn();
    // innerHTML 再描画で click 元 button が消えるため、combobox パターンに従って input にフォーカスを戻す
    const inputEl = document.getElementById('search-' + side);
    if (inputEl) inputEl.focus();
  }

  function updateBtn() {
    const btn = document.getElementById('compare-btn');
    const ready = !!(state.a && state.b && state.a !== state.b);
    btn.disabled = !ready;
    const hint = document.getElementById('compare-hint');
    if (hint) hint.style.display = ready ? 'none' : '';
    if (ready) {
      var pa = PRODUCTS.find(x => x.slug === state.a);
      var pb = PRODUCTS.find(x => x.slug === state.b);
      if (pa && pb) {
        btn.setAttribute('aria-label',
          isJa ? (pa.displayName + ' と ' + pb.displayName + ' を比較')
               : ('Compare ' + pa.displayName + ' and ' + pb.displayName));
      }
    } else {
      btn.removeAttribute('aria-label');
    }
  }

  function announceResultCount(side, count) {
    const status = document.getElementById('search-results-status');
    if (!status) return;
    const sideLabel = isJa ? (side === 'a' ? '製品 A' : '製品 B')
                           : (side === 'a' ? 'Product A' : 'Product B');
    if (count === 0) {
      status.textContent = sideLabel + ': ' + (isJa ? '該当なし' : 'No results');
    } else {
      status.textContent = sideLabel + ': ' + (isJa ? (count + ' 件') : (count + ' results'));
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function clearActive(side) {
    activeIdx[side] = -1;
    syncActiveDescendant(side);
  }

  function bindListKeyboard(side) {
    const inputEl = document.getElementById('search-' + side);
    // Combobox パターン: キーボード操作は input に集約 (listbox は非 focusable)
    // テキスト編集を優先し、listbox ナビゲーションキーのみ捕捉する
    inputEl.addEventListener('keydown', function(e) {
      // 日本語 IME 変換確定中の Enter / 矢印キーでハンドラが誤発火するのを防ぐ
      if (e.isComposing || e.keyCode === 229) return;
      const results = lastResults[side];
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveActive(side, 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveActive(side, -1);
          break;
        case 'Home':
          // キャレット先頭移動よりも listbox 先頭ハイライトを優先
          if (results.length > 0) {
            e.preventDefault();
            setActive(side, 0);
          }
          break;
        case 'End':
          if (results.length > 0) {
            e.preventDefault();
            setActive(side, results.length - 1);
          }
          break;
        case 'Enter':
          if (activeIdx[side] >= 0) {
            e.preventDefault();
            activateCurrent(side);
          }
          break;
        case 'Escape':
          // type=search のブラウザデフォルトクリアを上書きし、常に検索ワードもリセットする
          e.preventDefault();
          clearActive(side);
          if (inputEl.value !== '') {
            inputEl.value = '';
            const cleared = search('');
            renderList('list-' + side, cleared, side);
            announceResultCount(side, cleared.length);
          }
          break;
      }
    });
  }

  // Init
  ['a', 'b'].forEach(side => {
    const input = document.getElementById('search-' + side);
    const listId = 'list-' + side;
    input.addEventListener('input', () => {
      const results = search(input.value);
      renderList(listId, results, side);
      announceResultCount(side, results.length);
    });
    renderList(listId, PRODUCTS, side);
    bindListKeyboard(side);
  });

  document.getElementById('compare-btn').addEventListener('click', () => {
    if (!state.a || !state.b) return;
    window.location.href = BASE_PATH + 'compare/' + state.a + '-vs-' + state.b + '/';
  });
})();
</script>
<script>var PAGE_JA={subtitle:'全 ${products.length} 製品 — 2つ選んで詳細スペックを比較',productA:'製品 A',productB:'製品 B',searchPlaceholder:'ブランド名・モデル名で検索…',compareBtn:'比較する',compareHint:'Product A と Product B を選択',skipToMain:'メインコンテンツへスキップ',footer:'最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様'};</script>
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

  // Parse numeric value; for range strings like "0-65" or "-18-65" returns the mean of both ends
  function parseNumeric(val) {
    const s = String(val).trim();
    const rangeMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*[-\u2013]\s*(-?\d+(?:\.\d+)?)$/);
    if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
    return parseFloat(s);
  }

  function diffClass(key, valA, valB) {
    const higherBetter = ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn",
      "mainOut", "lineOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut",
      "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"];
    // THD+N and EIN are lower-is-better but use string formats; skip highlighting
    // Price: not highlighted (preference depends on buyer)
    if (!higherBetter.includes(key)) return ["", ""];
    const nA = parseNumeric(valA), nB = parseNumeric(valB);
    // 片側でも NaN なら比較対象外 (欠損を「優位」とは見なさない)
    if (isNaN(nA) || isNaN(nB)) return ["", ""];
    if (nA === nB) return ["", ""];
    return nA > nB ? [" highlight", ""] : ["", " highlight"];
  }

  function withMark(cell, cls) {
    if (!cls) return cell;
    return cell + '<span class="hl-mark" aria-hidden="true"> ✓</span><span class="sr-only"> Better value</span>';
  }

  let tableRows = "";
  for (const group of SPEC_GROUPS) {
    tableRows += `<tr class="group-header" id="${group.id}"><td colspan="3"><a href="#${group.id}" data-i18n-label="${escapeHtml(group.titleJa)}">${escapeHtml(group.title)}</a></td></tr>\n`;
    for (const key of group.keys) {
      const label = keyToLabel[key] || key;
      const labelJa = keyToLabelJa[key] || label;
      const [clsA, clsB] = diffClass(key, a[key], b[key]);
      const fmtVal = (val) => key === "price" && val != null && val !== ""
        ? '$' + Number(val).toLocaleString('en-US')
        : null;
      const cellA = fmtVal(a[key]) ?? displayValue(a[key]);
      const cellB = fmtVal(b[key]) ?? displayValue(b[key]);
      tableRows += `<tr>
  <th scope="row" class="label-col" data-i18n-label="${escapeHtml(labelJa)}">${escapeHtml(label)}</th>
  <td class="val-col${clsA}">${withMark(cellA, clsA)}</td>
  <td class="val-col${clsB}">${withMark(cellB, clsB)}</td>
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
  // canonical / og:url は正規順 (アルファベット順) に統一し、逆順ページも同一 URL を指す
  // JSON-LD の name / about も canonical と同じ正規順に固定する (逆順ページの SEO 同一性担保)
  const [canonA, canonB] = a.slug < b.slug ? [a, b] : [b, a];
  const canonSlugA = canonA.slug;
  const canonSlugB = canonB.slug;
  const canonTitle = `${canonA.displayName} vs ${canonB.displayName} — Audio Interface Comparator`;
  const jsonLd = safeJsonForScriptLD({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: canonTitle,
    about: [productJsonLd(canonA), productJsonLd(canonB)],
  });

  const compareUrl = `${SITE_URL}${BASE_PATH}compare/${canonSlugA}-vs-${canonSlugB}/`;
  const ogp = {
    type: "article",
    title: `${a.displayName} vs ${b.displayName}`,
    description: descEn,
    url: compareUrl,
  };

  const aUrl = sanitizeUrl(a.url);
  const bUrl = sanitizeUrl(b.url);
  return `${htmlHead(title, `<meta name="description" content="${escapeHtml(descEn)}" data-i18n-content="metaDesc" data-i18n-val="${escapeHtml(descJa)}">\n<link rel="canonical" href="${compareUrl}">\n<script type="application/ld+json">${jsonLd}</script>`, ogp)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container">
    <h1>${escapeHtml(a.displayName)} vs ${escapeHtml(b.displayName)}</h1>
    <div class="subtitle"><a href="${BASE_PATH}" style="color:inherit;text-decoration:none">Audio Interface Comparator</a> — <span data-i18n="subtitleCompare">${totalProducts} products covered</span></div>
  </div>
</header>
<main id="main">
  <div class="container">
    <a class="back-link" href="${BASE_PATH}" data-i18n="backLink">← Back to product selection</a>

    <div class="compare-header">
      <div class="product-card">
        <h2>${escapeHtml(a.displayName)}</h2>
        <div class="cat">${escapeHtml(a.category || "")}</div>
        ${a.price ? `<div class="price">$${Number(a.price).toLocaleString('en-US')}</div>` : '<div class="price no-price" data-i18n="noPrice">No price info</div>'}
        ${aUrl ? `<a class="ext-link" href="${escapeHtml(aUrl)}" target="_blank" rel="noopener noreferrer" data-i18n="productPage">Official product page →</a>` : ""}
      </div>
      <div class="product-card">
        <h2>${escapeHtml(b.displayName)}</h2>
        <div class="cat">${escapeHtml(b.category || "")}</div>
        ${b.price ? `<div class="price">$${Number(b.price).toLocaleString('en-US')}</div>` : '<div class="price no-price" data-i18n="noPrice">No price info</div>'}
        ${bUrl ? `<a class="ext-link" href="${escapeHtml(bUrl)}" target="_blank" rel="noopener noreferrer" data-i18n="productPage">Official product page →</a>` : ""}
      </div>
    </div>

    <div class="spec-table-wrap">
      <table class="spec-table">
        <caption class="sr-only">Audio interface spec comparison: ${escapeHtml(a.displayName)} vs ${escapeHtml(b.displayName)}</caption>
        <thead>
          <tr>
            <th scope="col" class="label-col" style="font-weight:700" data-i18n="specLabel">Spec</th>
            <th scope="col" class="val-col" style="font-weight:700">${escapeHtml(a.displayName)}</th>
            <th scope="col" class="val-col" style="font-weight:700">${escapeHtml(b.displayName)}</th>
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
    <span data-i18n="footer">Last updated: ${escapeHtml(buildDate)} — Source: Official manufacturer specs</span>
    <br><a href="https://github.com/semnil/audio-interface-compare-site/issues" target="_blank" rel="noopener noreferrer" data-i18n="reportIssue">Report an issue</a>
  </div>
</footer>
<script>var PAGE_JA={subtitleCompare:'${totalProducts} 製品を網羅',skipToMain:'メインコンテンツへスキップ',footer:'最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様'};</script>
<script src="${BASE_PATH}i18n.js"></script>
</body>
</html>`;
}

// ─── Product page ────────────────────────────────────────────────────────
function productPage(product, allProducts, buildDate) {
  const keyToLabel = {};
  const keyToLabelJa = {};
  for (const col of COLUMNS) {
    keyToLabel[col.key] = col.label;
    keyToLabelJa[col.key] = col.labelJa;
  }

  const pageUrl = `${SITE_URL}${BASE_PATH}products/${product.slug}/`;

  // Key specs for meta description
  const specParts = [];
  if (product.micPre != null && product.micPre !== "") {
    specParts.push(`${product.micPre} mic preamp${product.micPre === 1 ? "" : "s"}`);
  }
  if (product.sampleRate != null && product.sampleRate !== "") {
    specParts.push(`${product.sampleRate}kHz`);
  }
  if (product.usb != null && product.usb !== "") {
    specParts.push(String(product.usb));
  }
  const priceStr = product.price ? `$${Number(product.price).toLocaleString("en-US")}` : "";
  const specSuffix = specParts.length ? `: ${specParts.join(", ")}${priceStr ? `, ${priceStr}` : ""}` : (priceStr ? `: ${priceStr}` : "");
  const descEn = `${product.displayName} full specs${specSuffix}. Compare with ${allProducts.length - 1} other audio interfaces on Audio Interface Comparator.`;
  const descJa = `${product.displayName} の詳細スペック${specSuffix ? "（" + specParts.join("、") + (priceStr ? "、" + priceStr : "") + "）" : ""}。他 ${allProducts.length - 1} 製品と比較できます。`;

  // JSON-LD
  const jsonLdObj = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.displayName,
    brand: { "@type": "Brand", name: product.brand },
  };
  if (product.category) jsonLdObj.category = product.category;
  if (product.price) jsonLdObj.offers = { "@type": "Offer", price: String(product.price), priceCurrency: "USD" };
  const extUrl = sanitizeUrl(product.url);
  if (extUrl) jsonLdObj.url = extUrl;
  const jsonLd = safeJsonForScriptLD(jsonLdObj);

  // Spec table (2-column: label | value)
  let tableRows = "";
  for (const group of SPEC_GROUPS) {
    tableRows += `<tr class="group-header" id="${group.id}"><td colspan="2"><a href="#${group.id}" data-i18n-label="${escapeHtml(group.titleJa)}">${escapeHtml(group.title)}</a></td></tr>\n`;
    for (const key of group.keys) {
      const label = keyToLabel[key] || key;
      const labelJa = keyToLabelJa[key] || label;
      const cell = key === "price" && product[key] != null && product[key] !== ""
        ? `$${Number(product[key]).toLocaleString("en-US")}`
        : displayValue(product[key]);
      tableRows += `<tr>
  <th scope="row" class="label-col" data-i18n-label="${escapeHtml(labelJa)}">${escapeHtml(label)}</th>
  <td class="val-col">${cell}</td>
</tr>\n`;
    }
  }

  // Compare links: same brand first, then others, both alphabetical
  const sameBrand = [];
  const otherBrand = [];
  for (const other of allProducts) {
    if (other.slug === product.slug) continue;
    (other.brand === product.brand ? sameBrand : otherBrand).push(other);
  }
  sameBrand.sort((x, y) => x.displayName.localeCompare(y.displayName));
  otherBrand.sort((x, y) => x.displayName.localeCompare(y.displayName));

  function compareHref(other) {
    const [sa, sb] = product.slug < other.slug
      ? [product.slug, other.slug]
      : [other.slug, product.slug];
    return `${BASE_PATH}compare/${sa}-vs-${sb}/`;
  }

  const compareLinkItems = [...sameBrand, ...otherBrand].map((other) => {
    const otherPrice = other.price ? ` · $${Number(other.price).toLocaleString("en-US")}` : "";
    return `<li><a href="${escapeHtml(compareHref(other))}"><span class="brand">${escapeHtml(other.brand)}</span> ${escapeHtml(other.model)}<div class="meta">${escapeHtml(other.category || "")}${escapeHtml(otherPrice)}</div></a></li>`;
  }).join("\n");

  const title = `${product.displayName} Specs — Audio Interface Comparator`;
  const ogp = { type: "article", title: product.displayName, description: descEn, url: pageUrl };

  return `${htmlHead(title, `<meta name="description" content="${escapeHtml(descEn)}" data-i18n-content="metaDesc" data-i18n-val="${escapeHtml(descJa)}">\n<link rel="canonical" href="${escapeHtml(pageUrl)}">\n<script type="application/ld+json">${jsonLd}</script>`, ogp)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container">
    <h1>${escapeHtml(product.displayName)} Specs</h1>
    <div class="subtitle"><a href="${BASE_PATH}" style="color:inherit;text-decoration:none">Audio Interface Comparator</a> — <span data-i18n="subtitleProduct">${allProducts.length} products covered</span></div>
  </div>
</header>
<main id="main">
  <div class="container">
    <a class="back-link" href="${BASE_PATH}" data-i18n="backLink">← Back to product selection</a>

    <div class="product-card" style="margin-bottom:32px">
      <div class="cat">${escapeHtml(product.category || "")}</div>
      ${priceStr ? `<div class="price">${escapeHtml(priceStr)}</div>` : '<div class="price no-price" data-i18n="noPrice">No price info</div>'}
      ${extUrl ? `<a class="ext-link" href="${escapeHtml(extUrl)}" target="_blank" rel="noopener noreferrer" data-i18n="productPage">Official product page →</a>` : ""}
    </div>

    <div class="spec-table-wrap">
      <table class="spec-table">
        <caption class="sr-only">Audio interface specs: ${escapeHtml(product.displayName)}</caption>
        <thead>
          <tr>
            <th scope="col" class="label-col" style="font-weight:700" data-i18n="specLabel">Spec</th>
            <th scope="col" class="val-col" style="font-weight:700">${escapeHtml(product.displayName)}</th>
          </tr>
        </thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </div>

    <h2 class="compare-links-heading">Compare ${escapeHtml(product.displayName)} with...</h2>
    <ul class="compare-links">
${compareLinkItems}
    </ul>
  </div>
</main>
<footer>
  <div class="container">
    <span data-i18n="footer">Last updated: ${escapeHtml(buildDate)} — Source: Official manufacturer specs</span>
    <br><a href="https://github.com/semnil/audio-interface-compare-site/issues" target="_blank" rel="noopener noreferrer" data-i18n="reportIssue">Report an issue</a>
  </div>
</footer>
<script>var PAGE_JA={subtitleProduct:'全 ${allProducts.length} 製品を収録',skipToMain:'メインコンテンツへスキップ',footer:'最終更新: ${escapeHtml(buildDate)} — データソース: 各メーカー公式仕様'};</script>
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

  const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><rect x="10" y="16" width="10" height="32" rx="3" fill="#3b82f6"/><rect x="24" y="24" width="10" height="24" rx="3" fill="#818cf8"/><rect x="38" y="12" width="10" height="36" rx="3" fill="#a855f7"/></svg>`;
  writeFileSync(join(DIST, "favicon.svg"), FAVICON_SVG);
  writeFileSync(join(DIST, "favicon.ico"), generateFaviconIco());
  console.log("Wrote favicon.svg, favicon.ico");

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
  for (const p of products) {
    if (slugMap.has(p.slug)) {
      throw new Error(`Slug collision: ${p.slug} from ${p.brand} ${p.model}`);
    }
    slugMap.set(p.slug, p);
  }

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
      if (pageCount % 100 === 0) {
        // 100 ページごとに CPU を明け渡し、他プロセスの応答性を確保
        await new Promise((r) => setTimeout(r, 0));
      }
      if (pageCount % 4000 === 0) {
        console.log(`  ${pageCount} pages generated…`);
      }
    }
  }

  console.log(`Generated ${pageCount} comparison pages`);

  // 4. Product pages (one per product)
  for (const product of products) {
    const dir = join(DIST, "products", product.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "index.html"),
      minifyHtml(productPage(product, products, buildDate))
    );
  }
  console.log(`Generated ${products.length} product pages`);

  // 5. sitemap.xml (index + all product pages + same-brand canonical comparisons)
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  sitemap += `  <url><loc>${SITE_URL}${BASE_PATH}</loc><changefreq>monthly</changefreq></url>\n`;
  let sitemapCount = 1;
  for (const product of products) {
    sitemap += `  <url><loc>${SITE_URL}${BASE_PATH}products/${product.slug}/</loc><changefreq>monthly</changefreq></url>\n`;
    sitemapCount++;
  }
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      if (products[i].brand !== products[j].brand) continue;
      const [sa, sb] = products[i].slug < products[j].slug
        ? [products[i].slug, products[j].slug]
        : [products[j].slug, products[i].slug];
      sitemap += `  <url><loc>${SITE_URL}${BASE_PATH}compare/${sa}-vs-${sb}/</loc></url>\n`;
      sitemapCount++;
    }
  }
  sitemap += `</urlset>\n`;
  writeFileSync(join(DIST, "sitemap.xml"), sitemap);
  console.log(`Wrote sitemap.xml (${sitemapCount} URLs: 1 index + ${products.length} product pages + same-brand comparisons)`);

  console.timeEnd("build");
}

// エントリポイントとして直接実行された場合のみビルドを起動
// (テストから import したときに副作用で xlsx 読み込みが走るのを防ぐ)
// pathToFileURL を使い Windows (C:\\path\\to\\build.js) でも正しく一致させる
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build();
}

// テスト用エクスポート (本番ビルドには影響しない)
// diffClass は comparePage のクロージャ内に定義されているため、ここで同等実装を export する
export function _slugify(brand, model) { return slugify(brand, model); }
export function _escapeHtml(str) { return escapeHtml(str); }
export { COLUMNS };

// diffClass は comparePage 内のクロージャだが、テスト用に同等ロジックを再公開する
function _parseNumeric(val) {
  const s = String(val).trim();
  const rangeMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*[-\u2013]\s*(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  return parseFloat(s);
}
export function _diffClass(key, valA, valB) {
  const higherBetter = ["micPre", "comboIn", "lineIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn",
    "mainOut", "lineOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut",
    "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"];
  // THD+N and EIN are lower-is-better but use string formats; skip highlighting
  if (!higherBetter.includes(key)) return ["", ""];
  const nA = _parseNumeric(valA), nB = _parseNumeric(valB);
  // 片側でも NaN なら比較対象外 (欠損を「優位」とは見なさない)
  if (isNaN(nA) || isNaN(nB)) return ["", ""];
  if (nA === nB) return ["", ""];
  return nA > nB ? [" highlight", ""] : ["", " highlight"];
}
