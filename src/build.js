/**
 * build.js – generates the static HTML comparison site from the xlsx
 *
 * Steps:
 * 1. Read data/audio_interfaces.xlsx
 * 2. Write dist/products.json (data source for client-side search + dynamic comparison)
 * 3. Write dist/index.html (top page: product selection + search + client-side dynamic comparison)
 * 4. Write dist/compare.js (renders the comparison table in the browser from the fragment URL /#a=..&b=..)
 * 5. Write dist/products/{slug}/index.html for each product (individual spec pages)
 *
 * Comparisons no longer generate static pages for every pair; they moved to client-side fragment URLs.
 * Crawlers do not treat comparison URLs as separate URLs, so the indexed pages are limited to index + product pages.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setPriority, constants } from "node:os";
import ExcelJS from "exceljs";
import { createCanvas } from "@napi-rs/canvas";

// Lower the build process's CPU priority to reduce the impact on other applications
try { setPriority(constants.priority.PRIORITY_BELOW_NORMAL); } catch {}


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_FILE = join(ROOT, "data", "audio_interfaces.xlsx");
// Output directory: uses the environment variable DIST_DIR when set (for switching between CI / local tests)
const DIST = process.env.DIST_DIR
  ? join(process.env.DIST_DIR)
  : join(ROOT, "dist");

// Base path: supports GitHub Pages subdirectories
// custom domain → "/", repo pages → "/repo-name/"
// Guarantees a trailing slash + trims surrounding whitespace + collapses consecutive slashes
const BASE_PATH = (() => {
  let bp = (process.env.BASE_PATH || "/").trim();
  if (bp === "") bp = "/";
  if (!bp.endsWith("/")) bp += "/";
  if (!bp.startsWith("/")) bp = "/" + bp;
  bp = bp.replace(/\/+/g, "/");
  return bp;
})();
console.log(`BASE_PATH = "${BASE_PATH}"`);

// Site URL: the absolute URL base for OGP / canonical
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
  { key: "rcaIn",            label: "RCA Input",                    labelJa: "RCA入力" },
  { key: "hiZ",              label: "Hi-Z Inputs",                  labelJa: "Hi-Z入力" },
  { key: "adatIn",           label: "ADAT Input (ch@48kHz)",        labelJa: "ADAT入力 (ch@48kHz)" },
  { key: "opticalIn",        label: "Optical Ports (Input)",        labelJa: "光ポート (入力)" },
  { key: "spdifCoaxIn",      label: "S/PDIF (Coax) Input",          labelJa: "S/PDIF (同軸) 入力" },
  { key: "spdifOptIn",       label: "S/PDIF (Optical) Input",       labelJa: "S/PDIF (光) 入力" },
  { key: "aesIn",            label: "AES/EBU Input",                labelJa: "AES/EBU入力" },
  { key: "mainOut",          label: "Analog Main Output",           labelJa: "アナログメイン出力" },
  { key: "lineOut",          label: "Analog Line Output",           labelJa: "アナログライン出力" },
  { key: "rcaOut",           label: "RCA Output",                   labelJa: "RCA出力" },
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
  { key: "measurements",     label: "Measurement Reports",          labelJa: "測定レポート" },
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
    keys: ["micPre", "comboIn", "lineIn", "rcaIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn"],
  },
  {
    id: "output",
    title: "Outputs",       titleJa: "出力",
    keys: ["mainOut", "lineOut", "rcaOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut"],
  },
  {
    id: "features",
    title: "Features",      titleJa: "機能",
    keys: ["phantom", "midi", "loopback", "dsp", "directMon"],
  },
  {
    id: "performance",
    title: "Audio Performance", titleJa: "オーディオ性能",
    keys: ["sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown", "thdnMic", "thdnOut", "thdnUnknown", "einA", "einUnknown", "measurements"],
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

// key → {en, ja} labels. A single table shared by the build side (product pages) and the compare.js embedding
const KEY_LABELS = {};
for (const c of COLUMNS) KEY_LABELS[c.key] = { en: c.label, ja: c.labelJa };

// The only formatter for displaying prices (embedded into compare.js via .toString())
function fmtPrice(v) {
  return "$" + Number(v).toLocaleString("en-US");
}

// Rendering branches for spec table cells (measurements / price / others).
// A single implementation used by both the static product pages and the dynamic comparison view (embedded in compare.js)
function cellFor(p, key) {
  if (key === "measurements") return renderMeasurements(p[key]);
  if (key === "price" && p[key] != null && p[key] !== "") return fmtPrice(p[key]);
  return displayValue(p[key]);
}

// One-line items of the key specs (shared by the og:image spec line and the meta description)
function keySpecParts(p) {
  const parts = [];
  if (p.micPre != null && p.micPre !== "") parts.push(`${p.micPre} mic preamp${Number(p.micPre) === 1 ? "" : "s"}`);
  if (p.sampleRate != null && p.sampleRate !== "") parts.push(`${p.sampleRate} kHz${p.bitDepth ? ` / ${p.bitDepth}-bit` : ""}`);
  if (p.usb != null && p.usb !== "") parts.push(String(p.usb));
  return parts;
}

// Measurement reports column: converts markdown "[label](url) / [label](url)" into HTML external links
// URLs are limited to http(s) by sanitizeUrl, and both labels and URLs go through escapeHtml
function renderMeasurements(val) {
  const naSpan = '<span class="na" aria-label="No data">—</span>';
  if (val == null || val === "") return naSpan;
  const links = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(String(val))) !== null) {
    const url = sanitizeUrl(m[2]);
    if (!url) continue;
    // ↗ marks navigation to an external site (matching the site-wide convention for external links). The arrow is aria-hidden,
    // and sr-only text tells screen readers that it is an external site
    links.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m[1])}<span class="ext-arrow" aria-hidden="true"> ↗</span><span class="sr-only" data-i18n="extSite"> (external site)</span></a>`);
  }
  if (links.length === 0) return naSpan;
  return `<span class="measure-links">${links.join('<span class="sep" aria-hidden="true"> / </span>')}</span>`;
}

// For embedding JSON inside a <script> tag: escapes </script> breakouts and U+2028/U+2029
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// For embedding JSON-LD (application/ld+json). In addition to the above, also escapes & as \u0026
function safeJsonForScriptLD(obj) {
  return safeJsonForScript(obj).replace(/&/g, "\\u0026");
}

// Keeps the load-order contract PAGE_JA → i18n.js in one place. Escaping the value is
// guaranteed mechanically by safeJsonForScript (no hand-written quote escaping)
function i18nScripts(pageJa) {
  return `<script>var PAGE_JA=${safeJsonForScript(pageJa)};</script>
<script src="${BASE_PATH}i18n.js"></script>`;
}

// Sanitizes an external URL by limiting it to the http(s) schemes. Returns an empty string when invalid
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

// ─── og:image generation (1200x630 share card) ──────────────────────────
// Social share cards. For share CTR, not a ranking factor. Uses the same colors as the favicon (D4 design).
// Uses @napi-rs/canvas to draw text (the font falls back to the OS's sans-serif).
const OG_W = 1200;
const OG_H = 630;

function ogWrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let overflow = false;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else if (lines.length < maxLines - 1) {
      lines.push(line);
      line = word;
    } else {
      // The last line is full. The rest is cut off with an ellipsis
      overflow = true;
      break;
    }
  }
  if (line) lines.push(line);
  if (overflow) {
    let last = lines[lines.length - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

// Only draws and returns the canvas. The caller does the PNG encoding with canvas.encode("png") (async),
// run in parallel per batch — with the synchronous toBuffer, encoding (17ms/card × 309 cards) took 80% of the build time.
// Caution: drawing another canvas while an encode is in flight crashes @napi-rs/canvas 1.x, so
// within a batch keep the order "finish all drawing → encode all" (see the og loop in build())
function drawOgCard({ title, subtitle = "", specLine = "" }) {
  const canvas = createCanvas(OG_W, OG_H);
  const ctx = canvas.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, OG_W, OG_H);
  g.addColorStop(0, "#1e1b4b");
  g.addColorStop(1, "#0f172a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OG_W, OG_H);

  // The 3-bar logo motif (same colors as the favicon)
  const bars = [
    { x: 64, y: 76, w: 18, h: 56, color: "#3b82f6" },
    { x: 90, y: 90, w: 18, h: 42, color: "#818cf8" },
    { x: 116, y: 69, w: 18, h: 63, color: "#a855f7" },
  ];
  for (const b of bars) {
    ctx.fillStyle = b.color;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 5);
      ctx.fill();
    } else {
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 28px sans-serif";
  ctx.fillText("AUDIO INTERFACE COMPARATOR", 156, 112);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 68px sans-serif";
  const lines = ogWrapText(ctx, title, OG_W - 128, 2);
  let y = 292;
  for (const line of lines) {
    ctx.fillText(line, 64, y);
    y += 82;
  }

  if (subtitle) {
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "500 40px sans-serif";
    ctx.fillText(ogWrapText(ctx, subtitle, OG_W - 128, 1)[0] || "", 64, y + 6);
    y += 60;
  }
  if (specLine) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "400 32px sans-serif";
    ctx.fillText(ogWrapText(ctx, specLine, OG_W - 128, 1)[0] || "", 64, y + 10);
  }

  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(0, OG_H - 12, OG_W, 12);

  return canvas;
}

// ─── Read xlsx ──────────────────────────────────────────────────────────
async function readXlsx() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DATA_FILE);
  const ws = wb.worksheets[0];

  // Read row 1 as the header
  const headerRow = ws.getRow(1);
  const headerMap = {}; // colNumber → internal key
  headerRow.eachCell((cell, colNumber) => {
    const label = String(cell.value).trim();
    const col = COLUMNS.find((c) => c.label === label);
    if (col) headerMap[colNumber] = col.key;
  });

  // Read rows from row 2 on as data
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

// Storage key for the language choice. semnil.github.io shares one origin between projects, so it is namespaced
const LANG_PREF_KEY = "aicmp-lang";

// Language redirect on the first visit (English pages only, asymmetric).
// When there is no saved choice and navigator.language is ja, location.replace to the same path under /ja/.
// It does not fire on the /ja/ side: sending Googlebot (en locale) to / when it renders /ja/
// would break the /ja/ index. On en pages the condition does not hold for Googlebot (navigator=en), so the redirect does not fire.
// After that, the toggle choice (saved to localStorage by i18n.js) is respected.
// Note: the variable is written `var BP = ` (with spaces) so it does not match localizeToJa's `="..."` / `const BASE_PATH = ` patterns
function langRedirectSnippet() {
  return `<script>(function(){
if(document.documentElement.lang==='ja')return;
var BP = ${JSON.stringify(BASE_PATH)};
if(location.pathname.indexOf(BP+'ja/')===0)return;
var pref=null;try{pref=localStorage.getItem(${JSON.stringify(LANG_PREF_KEY)});}catch(e){}
if(pref==='ja'||(!pref&&/^ja\\b/.test(navigator.language)))
location.replace(BP+'ja/'+location.pathname.slice(BP.length)+location.search+location.hash);
})();</script>`;
}

// alternates: { enUrl, jaUrl } (absolute URLs). When given, outputs hreflang alternate + x-default and
// the first-visit language redirect snippet (not output for pages without alternates, such as 404).
// The lang attribute is always output as "en", and localizeToJa() rewrites it to "ja" for /ja/ pages.
function htmlHead(title, extra = "", ogp = null, alternates = null) {
  const ogpTags = ogp ? (() => {
    const t = escapeHtml(ogp.title || title);
    const d = escapeHtml(ogp.description || "");
    const u = escapeHtml(ogp.url || SITE_URL + BASE_PATH);
    const img = ogp.image ? escapeHtml(ogp.image) : "";
    const imgTags = img ? `
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="${OG_W}">
<meta property="og:image:height" content="${OG_H}">` : "";
    const twImgTag = img ? `
<meta name="twitter:image" content="${img}">` : "";
    return `
<meta property="og:type" content="${ogp.type || "website"}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:site_name" content="Audio Interface Comparator">${imgTags}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">${twImgTag}`;
  })() : "";
  const hreflangTags = alternates ? `
<link rel="alternate" hreflang="en" href="${escapeHtml(alternates.enUrl)}">
<link rel="alternate" hreflang="ja" href="${escapeHtml(alternates.jaUrl)}">
<link rel="alternate" hreflang="x-default" href="${escapeHtml(alternates.enUrl)}">` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${alternates ? langRedirectSnippet() : ""}
<title>${escapeHtml(title)}</title>
<meta name="google-site-verification" content="O6oFrJyEg-Om0e19Q1QZpGG3DeKfy0ggL_tQWnAaWgI" />${ogpTags}${hreflangTags}
<link rel="icon" href="${BASE_PATH}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${BASE_PATH}favicon.ico" sizes="48x48">
<link rel="stylesheet" href="${BASE_PATH}style.css">
${extra}
</head>`;
}

// Language toggle. target is the language to switch to ("ja" → 「日本語」 / "en" → 「English」).
// Both the template and localizeToJa() use this function, keeping the markup's single source of truth in one place
function langToggle(href, target) {
  const label = target === "ja" ? "日本語" : "English";
  return `<a class="lang-toggle" href="${escapeHtml(href)}" hreflang="${target}">${label}</a>`;
}

// Throws when the replacements fall short of the expected count. A fail-fast guard that turns the known fragility of the
// regex post-processing approach (localizeToJa) from "a template change silently reaches production" into "the build fails"
function mustReplace(html, pattern, replacement, minCount, label) {
  const found = typeof pattern === "string"
    ? html.split(pattern).length - 1
    : (html.match(pattern) || []).length;
  if (found < minCount) {
    throw new Error(`localizeToJa: pattern mismatch (${label}): expected >= ${minCount}, found ${found}`);
  }
  return html.replace(pattern, replacement);
}

// Converts the generated HTML of an English page into the /ja/ page.
// - <html lang> to ja
// - internal page links (home / products / brands / categories / comparison fragment) under /ja/
// - canonical / og:url to the /ja/ URL (self-referencing)
// - PAGE_BASE in the index inline script to /ja/ (for specs-link)
// - replaces the language toggle with a link to the English version
// Assets (style.css / i18n.js / compare.js / favicon / products.json / sitemap.xml) are served from the root with distinct
// file names, so they do not match the patterns below and are left as they are.
// Body text is translated on the client by i18n.js from lang=ja (visible to Googlebot too through the lang condition).
// The joints present on every page (lang / canonical / og:url / toggle / index's PAGE_BASE) have their counts
// verified with mustReplace. Link rewrites whose count depends on the page kind use an ordinary replace.
function localizeToJa(enHtml, enHref, jaHref, { hasInlineBase = false } = {}) {
  const bp = BASE_PATH;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let html = enHtml;
  html = mustReplace(html, '<html lang="en">', '<html lang="ja">', 1, "lang attribute");
  // Internal page links: ="${bp}products/ etc. → ="${bp}ja/products/
  for (const seg of ["products/", "brands/", "categories/"]) {
    html = html.replace(new RegExp(`="${esc(bp + seg)}`, "g"), `="${bp}ja/${seg}`);
  }
  // Comparison fragment: ="${bp}#... → ="${bp}ja/#...
  html = html.replace(new RegExp(`="${esc(bp)}#`, "g"), `="${bp}ja/#`);
  // Home link (exact match ="${bp}") → ="${bp}ja/"
  html = html.replace(new RegExp(`="${esc(bp)}"`, "g"), `="${bp}ja/"`);
  html = mustReplace(html, new RegExp(`(rel="canonical" href="${esc(SITE_URL + bp)})`, "g"), `$1ja/`, 1, "canonical");
  html = mustReplace(html, new RegExp(`(property="og:url" content="${esc(SITE_URL + bp)})`, "g"), `$1ja/`, 1, "og:url");
  html = mustReplace(html,
    `const PAGE_BASE = ${JSON.stringify(bp)};`,
    `const PAGE_BASE = ${JSON.stringify(bp + "ja/")};`,
    hasInlineBase ? 1 : 0, "inline PAGE_BASE");
  html = mustReplace(html, langToggle(jaHref, "ja"), langToggle(enHref, "en"), 1, "lang-toggle");
  return html;
}

// Shared i18n script (written to dist/i18n.js)
// PAGE_JA is expected to be set by each page before loading this script
// Languages are separated by URL (/ = English, /ja/ = Japanese). i18n works from <html lang>,
// not navigator.language. So /ja/ pages are always shown in Japanese even to Googlebot (en locale),
// and / always stays English (hreflang + the language toggle lead between them).
// Exposes window.__i18n.apply(root) and also applies the translation to DOM subtrees inserted by compare.js.
const I18N_JS = `(function(){
var isJa=document.documentElement.lang==='ja';
var ja=Object.assign({aiDisclaimer:'スペック情報は AI を活用して収集しており、誤りが含まれる可能性があります。正確な情報は各メーカー公式サイトをご確認ください。',backLink:'← 製品選択に戻る',noPrice:'価格情報なし',productPage:'公式製品ページ →',specLabel:'スペック項目',reportIssue:'問題を報告',extSite:' (外部サイト)'},typeof PAGE_JA!=='undefined'?PAGE_JA:{});
function apply(root){
if(!isJa)return;
root=root||document;
root.querySelectorAll('[data-i18n]').forEach(function(el){var k=el.getAttribute('data-i18n');if(ja[k])el.textContent=ja[k];});
root.querySelectorAll('[data-i18n-content]').forEach(function(el){var v=el.getAttribute('data-i18n-val');if(v)el.setAttribute('content',v);});
root.querySelectorAll('[data-i18n-label]').forEach(function(el){el.textContent=el.getAttribute('data-i18n-label');});
root.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){var k=el.getAttribute('data-i18n-placeholder');if(ja[k])el.placeholder=ja[k];});
}
window.__i18n={isJa:isJa,ja:ja,apply:apply};
apply(document);
document.querySelectorAll('.lang-toggle').forEach(function(el){
el.addEventListener('click',function(){try{localStorage.setItem('${LANG_PREF_KEY}',el.getAttribute('hreflang')||'en');}catch(e){}});
});
})();`;

// ─── Client-side compare renderer (dist/compare.js) ─────────────────────
// Script that renders the comparison table in the browser. Embeds build.js's helpers (escapeHtml / sanitizeUrl /
// displayValue / renderMeasurements / parseNumeric / diffClass) via .toString() and
// renders with the same logic and markup as the old server-generated comparison pages (avoids maintaining two copies).
// Generates markup with data-i18n / data-i18n-label and translates it into Japanese with window.__i18n.apply() after insertion.
// Note: this approach depends on build.js running as plain, untranspiled ESM.
function compareJs() {
  // Precondition guard: embedding via .toString() breaks if transpiling/bundling turns it into '[native code]'
  const embedded = [escapeHtml, sanitizeUrl, displayValue, renderMeasurements, parseNumeric, diffClass, fmtPrice, cellFor];
  for (const fn of embedded) {
    if (fn.toString().includes("[native code]")) {
      throw new Error(`compareJs: ${fn.name} has become native code and cannot be embedded`);
    }
  }
  return `(function(){
"use strict";
var ROOT_BASE=${JSON.stringify(BASE_PATH)};
// Shared assets such as products.json are always at the root. Page links (back-link) go to the current language's home.
var PAGE_BASE=(location.pathname.indexOf(ROOT_BASE+'ja/')===0)?ROOT_BASE+'ja/':ROOT_BASE;
var GROUPS=${safeJsonForScript(SPEC_GROUPS)};
var LABELS=${safeJsonForScript(KEY_LABELS)};
var HIGHER_BETTER=new Set(${safeJsonForScript([...HIGHER_BETTER])});
var RANGE_RE=${RANGE_RE.toString()};
${escapeHtml.toString()}
${sanitizeUrl.toString()}
${displayValue.toString()}
${renderMeasurements.toString()}
${parseNumeric.toString()}
${diffClass.toString()}
${fmtPrice.toString()}
${cellFor.toString()}
function withMark(cell,cls){if(!cls)return cell;return cell+'<span class="hl-mark" aria-hidden="true"> \\u2713</span><span class="sr-only"> Better value</span>';}
function buildRows(a,b){
  var rows='';
  for(var gi=0;gi<GROUPS.length;gi++){
    var g=GROUPS[gi];
    rows+='<tr class="group-header" id="'+g.id+'"><td colspan="3"><a href="#'+g.id+'" data-i18n-label="'+escapeHtml(g.titleJa)+'">'+escapeHtml(g.title)+'</a></td></tr>';
    for(var ki=0;ki<g.keys.length;ki++){
      var key=g.keys[ki];
      var lab=LABELS[key]||{en:key,ja:key};
      var d=diffClass(key,a[key],b[key]);
      var clsA=d[0],clsB=d[1];
      rows+='<tr><th scope="row" class="label-col" data-i18n-label="'+escapeHtml(lab.ja)+'">'+escapeHtml(lab.en)+'</th>'
        +'<td class="val-col'+clsA+'">'+withMark(cellFor(a,key),clsA)+'</td>'
        +'<td class="val-col'+clsB+'">'+withMark(cellFor(b,key),clsB)+'</td></tr>';
    }
  }
  return rows;
}
function extLink(p){var u=sanitizeUrl(p.url);return u?'<a class="ext-link" href="'+escapeHtml(u)+'" target="_blank" rel="noopener noreferrer" data-i18n="productPage">Official product page \\u2192</a>':'';}
function card(p){
  var price=(p.price!=null&&p.price!=='')?'<div class="price">'+escapeHtml(fmtPrice(p.price))+'</div>':'<div class="price no-price" data-i18n="noPrice">No price info</div>';
  return '<div class="product-card"><h2>'+escapeHtml(p.displayName)+'</h2><div class="cat">'+escapeHtml(p.category||'')+'</div>'+price+extLink(p)+'</div>';
}
function backLink(){return '<a class="back-link" href="'+PAGE_BASE+'" data-i18n="backLink">\\u2190 Back to product selection</a>';}
function renderCompare(a,b){
  return backLink()
    +'<div class="compare-header">'+card(a)+card(b)+'</div>'
    +'<div class="spec-table-wrap"><table class="spec-table">'
    +'<caption class="sr-only">Audio interface spec comparison: '+escapeHtml(a.displayName)+' vs '+escapeHtml(b.displayName)+'</caption>'
    +'<thead><tr><th scope="col" class="label-col" style="font-weight:700" data-i18n="specLabel">Spec</th>'
    +'<th scope="col" class="val-col" style="font-weight:700">'+escapeHtml(a.displayName)+'</th>'
    +'<th scope="col" class="val-col" style="font-weight:700">'+escapeHtml(b.displayName)+'</th></tr></thead>'
    +'<tbody>'+buildRows(a,b)+'</tbody></table></div>';
}
var DATA=null,loading=null;
function ensureData(){
  if(DATA)return Promise.resolve(DATA);
  if(loading)return loading;
  loading=fetch(ROOT_BASE+'products.json').then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();}).then(function(list){
    var map={};for(var i=0;i<list.length;i++)map[list[i].slug]=list[i];DATA=map;return map;
  });
  return loading;
}
function parseHash(){
  var h=location.hash.replace(/^#/,'');
  if(!h)return null;
  var params=new URLSearchParams(h);
  var a=params.get('a'),b=params.get('b');
  if(!a||!b)return null;
  return {a:a,b:b};
}
function i18nApply(el){if(window.__i18n)window.__i18n.apply(el);}
function selectorView(){return document.getElementById('selector-view');}
function compareView(){return document.getElementById('compare-view');}
function showSelector(){
  var cv=compareView();if(cv){cv.hidden=true;cv.innerHTML='';}
  var sv=selectorView();if(sv)sv.hidden=false;
}
function showStatus(cv,key,en){
  cv.innerHTML=backLink()+'<p class="compare-status" data-i18n="'+key+'">'+en+'</p>';
  i18nApply(cv);
}
function showCompare(slugA,slugB){
  var sv=selectorView();if(sv)sv.hidden=true;
  var cv=compareView();if(!cv)return;
  cv.hidden=false;
  showStatus(cv,'loading','Loading\\u2026');
  ensureData().then(function(map){
    // Abort the stale render if the user navigated to another pair or left before the fetch completed
    var cur=parseHash();
    if(!cur||cur.a!==slugA||cur.b!==slugB)return;
    var a=map[slugA],b=map[slugB];
    if(!a||!b){showStatus(cv,'notFound','One or both products were not found.');return;}
    document.title=a.displayName+' vs '+b.displayName+' \\u2014 Audio Interface Comparator';
    cv.innerHTML=renderCompare(a,b);
    i18nApply(cv);
    window.scrollTo(0,0);
    cv.setAttribute('tabindex','-1');
    cv.focus({preventScroll:true});
  }).catch(function(){
    showStatus(cv,'loadError','Failed to load comparison data.');
  });
}
function route(){
  var sel=parseHash();
  if(sel)showCompare(sel.a,sel.b);else showSelector();
}
document.addEventListener('click',function(e){
  var t=e.target.closest('.back-link');
  if(t&&compareView()&&!compareView().hidden){
    e.preventDefault();
    history.pushState(null,'',PAGE_BASE);
    showSelector();
    var first=document.getElementById('search-a');if(first)first.focus();
  }
});
// On the pushState path the click handler calls showSelector() directly, and hash navigation and history back/forward
// are both caught by hashchange (also using popstate would render twice on every navigation)
window.addEventListener('hashchange',route);
route();
})();`;
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
.header-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.lang-toggle {
  flex: none;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
}
.lang-toggle:hover { border-color: var(--accent); background: var(--accent-light); }
.lang-toggle:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
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
/* The selected item has an accent background, so a white inner ring makes the focus ring visible */
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
  /* Keeps a contrast of 5.6:1 on the accent-light hover background (#eff6ff) / 6.53:1 on white */
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

/* ─ Comparison view (client-rendered) ─ */
[hidden] { display: none !important; }
/* No ring is needed for programmatic focus on the container (controlling the SR reading order) */
.compare-view:focus { outline: none; }
.compare-status {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.95rem;
}
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
/* #94a3b8 is 3.03:1 against white — readable enough for decorative use */
.spec-table .na { color: #94a3b8; }
.spec-table .highlight { background: var(--accent-light); font-weight: 600; }
.spec-table .highlight .hl-mark {
  margin-left: 6px;
  color: var(--green);
  font-weight: 700;
}
.spec-table .measure-links { font-size: 0.85rem; line-height: 1.5; }
.spec-table .measure-links a { color: var(--accent); text-decoration: none; white-space: nowrap; }
.spec-table .measure-links .ext-arrow { font-size: 0.85em; }
.spec-table .measure-links a:hover { text-decoration: underline; }
.spec-table .measure-links .sep { color: #cbd5e1; }

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
  /* 6.16:1 contrast on the body bg (#f8f9fa) (meets WCAG AA) */
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
.product-summary {
  margin: 0 0 24px;
  padding: 16px 20px;
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  font-size: 0.95rem;
  color: var(--text);
  line-height: 1.7;
}
.compare-links-heading {
  font-size: 1.1rem;
  margin: 48px 0 16px;
}
.compare-links,
.hub-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}
.compare-links li a,
.hub-list li a {
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
.compare-links li a:hover,
.hub-list li a:hover { border-color: var(--accent); background: var(--accent-light); }
.compare-links li a:focus-visible,
.hub-list li a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.compare-links .brand,
.hub-list .brand { font-weight: 600; }
.compare-links .meta,
.hub-list .meta { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; }

/* ─ Browse (index static hub links) ─ */
.browse { margin-top: 32px; }
.browse h2 { font-size: 1rem; margin: 0 0 12px; color: var(--text-secondary); }
.browse-group { margin-bottom: 24px; }
.browse-group h3 { font-size: 0.82rem; font-weight: 600; color: var(--text); margin: 0 0 8px; }
.browse-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.browse-links li a {
  display: inline-block;
  padding: 6px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  text-decoration: none;
  color: var(--accent);
  font-size: 0.85rem;
}
.browse-links li a:hover { border-color: var(--accent); background: var(--accent-light); }
.browse-links li a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.browse-links .count { color: var(--text-secondary); }

/* ─ 404 page ─ */
.notfound { text-align: center; padding: 48px 0 64px; }
.notfound-code {
  font-size: 4rem;
  font-weight: 800;
  color: var(--accent);
  margin: 0;
  line-height: 1;
}
.notfound h2 { font-size: 1.4rem; margin: 16px 0 8px; }
.notfound p { color: var(--text-secondary); }
.notfound .compare-btn { color: #fff; margin: 16px 0 8px; }

/* Minimizes transitions / animations for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;

function indexPage(products, brandGroups, categoryGroups, buildDate) {
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

  const descEn = `Compare specs of ${products.length} audio interfaces side by side — mic preamps, inputs, outputs, audio performance (DR/THD+N/EIN), connection, and price.`;
  const descJa = `オーディオインターフェース ${products.length} 機種の詳細スペックを横並び比較。マイクプリ・入出力数・オーディオ性能 (DR/THD+N/EIN)・接続規格・価格をひと目で確認。`;
  const ogp = {
    type: "website",
    title: "Audio Interface Comparator",
    description: descEn,
    url: `${SITE_URL}${BASE_PATH}`,
    image: `${SITE_URL}${BASE_PATH}og/site.png`,
  };
  const headExtra = `<meta name="description" content="${escapeHtml(descEn)}" data-i18n-content="metaDesc" data-i18n-val="${escapeHtml(descJa)}">\n<link rel="canonical" href="${SITE_URL}${BASE_PATH}">`;
  const alternates = { enUrl: `${SITE_URL}${BASE_PATH}`, jaUrl: `${SITE_URL}${BASE_PATH}ja/` };

  // Static browse paths (links to the per-brand / per-category hubs). They create a crawl path to the product pages
  // that does not depend on rendering, and target list-type queries
  const brandLinks = brandGroups.map((g) => `<li><a href="${BASE_PATH}brands/${g.slug}/">${escapeHtml(g.name)} <span class="count">(${g.items.length})</span></a></li>`).join("");
  const catLinks = categoryGroups.map((g) => `<li><a href="${BASE_PATH}categories/${g.slug}/">${escapeHtml(g.name)} <span class="count">(${g.items.length})</span></a></li>`).join("");
  const browseSection = `<section class="browse" aria-labelledby="browse-heading">
      <h2 id="browse-heading" data-i18n="browseHeading">Browse all products</h2>
      <div class="browse-group">
        <h3 data-i18n="browseBrands">By brand</h3>
        <ul class="browse-links">${brandLinks}</ul>
      </div>
      <div class="browse-group">
        <h3 data-i18n="browseCategories">By category</h3>
        <ul class="browse-links">${catLinks}</ul>
      </div>
    </section>`;

  return `${htmlHead("Audio Interface Comparator", headExtra, ogp, alternates)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container header-bar">
    <div>
      <h1>Audio Interface Comparator</h1>
      <div class="subtitle" data-i18n="subtitle">${products.length} products — Select two to compare specs</div>
    </div>
    ${langToggle(`${BASE_PATH}ja/`, "ja")}
  </div>
</header>
<main id="main">
  <div class="container">
    <noscript><p class="noscript-warning">JavaScript is required to search and compare. Browse by brand or category below, or open the <a href="${BASE_PATH}sitemap.xml">sitemap</a> for all product spec pages.</p></noscript>
    <div id="selector-view">
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
    ${browseSection}
    </div>
    <div id="compare-view" class="compare-view" hidden></div>
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
  const PAGE_BASE = ${JSON.stringify(BASE_PATH)};
  const PRODUCTS = ${productJson};
  const isJa = document.documentElement.lang === 'ja';

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
  // The currently focused option per listbox (managing aria-activedescendant)
  const activeIdx = { a: -1, b: -1 };
  const lastResults = { a: [], b: [] };

  function optionId(side, slug) {
    return 'opt-' + side + '-' + slug;
  }

  function renderList(containerId, results, side) {
    const el = document.getElementById(containerId);
    // Keeps the active slug from before the re-render, and after filtering tracks the same product and renumbers idx
    const prevResults = lastResults[side];
    const prevIdx = activeIdx[side];
    const prevSlug = (prevIdx >= 0 && prevResults && prevResults[prevIdx]) ? prevResults[prevIdx].slug : null;
    lastResults[side] = results;
    if (results.length === 0) {
      // role="presentation" excludes it from the listbox's option count (aria-live announces 0 results separately)
      el.innerHTML = '<div role="presentation" style="padding:16px;color:#64748b;font-size:0.9rem">' + (isJa ? '該当なし' : 'No results') + '</div>';
      activeIdx[side] = -1;
      syncActiveDescendant(side);
      return;
    }
    var otherSide = side === 'a' ? 'b' : 'a';
    el.innerHTML = results.map(p => {
      var sel = state[side] === p.slug ? ' selected' : '';
      var isDisabled = state[otherSide] === p.slug;
      // With the disabled attribute on the button element, SRs read the disabled state correctly, so aria-disabled would be redundant
      var ariaSel = sel ? ' aria-selected="true"' : ' aria-selected="false"';
      var priceStr = p.price ? '$' + Number(p.price).toLocaleString('en-US') : '';
      var specsLabel = isJa ? '仕様 ↗' : 'Specs ↗';
      var specsHref = PAGE_BASE + 'products/' + p.slug + '/';
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
    // If the previously active product remains after filtering, track its new idx; otherwise clear it
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
    // Following the WAI-ARIA APG Combobox pattern: aria-activedescendant goes on the focusable input
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
    // When only disabled options continue to the end, stop without wrapping
    while (idx >= 0 && idx < results.length && isOptionDisabled(side, idx)) {
      idx += step;
    }
    if (idx < 0 || idx >= results.length) return; // Keep the current state if no enabled option is found
    activeIdx[side] = idx;
    syncActiveDescendant(side);
    scrollActiveIntoView(side);
  }

  function setActive(side, idx) {
    const results = lastResults[side];
    if (idx < 0 || idx >= results.length) return;
    // Skip disabled options at the start/end and pick the first enabled option
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
    if (state[otherSide] === slug) return; // Ignore if already selected on the other side
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
    // The innerHTML re-render removes the clicked button, so focus goes back to the input as the combobox pattern says
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
    // Combobox pattern: keyboard handling is consolidated on the input (the listbox is not focusable)
    // Text editing takes priority; only the listbox navigation keys are captured
    inputEl.addEventListener('keydown', function(e) {
      // Prevents the handler from firing by mistake on Enter / arrow keys while a Japanese IME conversion is being committed
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
          // Highlighting the first listbox option takes priority over moving the caret to the start
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
          // Overrides the browser's default clearing for type=search and always resets the search term too
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
    // Navigate to the fragment URL. compare.js receives hashchange and renders the comparison table
    location.hash = '#a=' + encodeURIComponent(state.a) + '&b=' + encodeURIComponent(state.b);
  });
})();
</script>
${i18nScripts({
  subtitle: `全 ${products.length} 製品 — 2つ選んで詳細スペックを比較`,
  productA: "製品 A",
  productB: "製品 B",
  searchPlaceholder: "ブランド名・モデル名で検索…",
  compareBtn: "比較する",
  compareHint: "Product A と Product B を選択",
  skipToMain: "メインコンテンツへスキップ",
  loading: "読み込み中…",
  notFound: "指定された製品が見つかりませんでした。",
  loadError: "比較データの読み込みに失敗しました。",
  browseHeading: "すべての製品を見る",
  browseBrands: "ブランド別",
  browseCategories: "カテゴリ別",
  footer: `最終更新: ${buildDate} — データソース: 各メーカー公式仕様`,
})}
<script src="${BASE_PATH}compare.js"></script>
</body>
</html>`;
}

// Parse numeric value; for range strings like "-18 to +70" (canonical) or legacy "0-65" / "-18-65"
// returns the mean of both ends
const RANGE_RE = /^([+-]?\d+(?:\.\d+)?)\s*(?:[-\u2013]|to\s)\s*([+-]?\d+(?:\.\d+)?)$/i;
function parseNumeric(val) {
  const s = String(val).trim();
  const rangeMatch = s.match(RANGE_RE);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  return parseFloat(s);
}

// THD+N and EIN are lower-is-better but use string formats; skip highlighting
// Price: not highlighted (preference depends on buyer)
const HIGHER_BETTER = new Set(["micPre", "comboIn", "lineIn", "rcaIn", "hiZ", "adatIn", "opticalIn", "spdifCoaxIn", "spdifOptIn", "aesIn",
  "mainOut", "lineOut", "rcaOut", "hpOut", "adatOut", "opticalOut", "spdifCoaxOut", "spdifOptOut", "aesOut",
  "sampleRate", "bitDepth", "gainRange", "drIn", "drOut", "drUnknown"]);
function diffClass(key, valA, valB) {
  if (!HIGHER_BETTER.has(key)) return ["", ""];
  const nA = parseNumeric(valA), nB = parseNumeric(valB);
  // If either side is NaN it is not compared (a missing value is never treated as "better")
  if (isNaN(nA) || isNaN(nB)) return ["", ""];
  if (nA === nB) return ["", ""];
  return nA > nB ? [" highlight", ""] : ["", " highlight"];
}

// ─── Spec summary (machine-generated, data-driven) ─────────────────────────
// Generates a 2-4 sentence English/Japanese summary only from existing xlsx data (never filled in by guessing).
// The aim is to increase the amount of text unique to each product page and ease near-duplicate page assessments.
function specSummary(product) {
  const num = (v) => (v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
  const yes = (v) => v != null && String(v).trim().toLowerCase().startsWith("yes");
  const listEn = (arr) => arr.length <= 1 ? (arr[0] || "")
    : arr.length === 2 ? `${arr[0]} and ${arr[1]}`
    : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
  const en = [];
  const ja = [];

  const conn = product.usb != null && product.usb !== "" ? String(product.usb) : "";
  en.push(`${product.displayName} is an audio interface${conn ? ` with ${conn} connectivity` : ""}.`);
  ja.push(`${product.displayName} は${conn ? ` ${conn} 接続の` : ""}オーディオインターフェースです。`);

  const pusher = (arr, arrJa) => (v, unitEn, plEn, labelJa) => {
    const n = num(v);
    if (n) { arr.push(`${n} ${n === 1 ? unitEn : plEn}`); arrJa.push(`${labelJa} ${n}`); }
  };
  const ins = [], insJa = [];
  const pushIn = pusher(ins, insJa);
  pushIn(product.micPre, "mic preamp", "mic preamps", "マイクプリ");
  pushIn(product.comboIn, "combo input", "combo inputs", "Combo 入力");
  pushIn(product.lineIn, "line input", "line inputs", "ライン入力");
  pushIn(product.hiZ, "Hi-Z input", "Hi-Z inputs", "Hi-Z 入力");
  if (ins.length) { en.push(`Inputs include ${listEn(ins)}.`); ja.push(`入力は${insJa.join("・")}を備えます。`); }

  const outs = [], outsJa = [];
  const pushOut = pusher(outs, outsJa);
  pushOut(product.mainOut, "main output", "main outputs", "メイン出力");
  pushOut(product.lineOut, "line output", "line outputs", "ライン出力");
  pushOut(product.hpOut, "headphone output", "headphone outputs", "ヘッドフォン出力");
  if (outs.length) { en.push(`Outputs include ${listEn(outs)}.`); ja.push(`出力は${outsJa.join("・")}を備えます。`); }

  const caps = [], capsJa = [];
  const sr = num(product.sampleRate), bd = num(product.bitDepth);
  if (sr && bd) { caps.push(`up to ${sr} kHz / ${bd}-bit`); capsJa.push(`最大 ${sr} kHz / ${bd} bit`); }
  else if (sr) { caps.push(`up to ${sr} kHz`); capsJa.push(`最大 ${sr} kHz`); }
  if (yes(product.phantom)) { caps.push("48V phantom power"); capsJa.push("48V ファンタム電源"); }
  if (yes(product.loopback)) { caps.push("loopback"); capsJa.push("ループバック"); }
  if (yes(product.dsp)) { caps.push("onboard DSP"); capsJa.push("DSP エフェクト"); }
  if (yes(product.directMon)) { caps.push("direct monitoring"); capsJa.push("ダイレクトモニタリング"); }
  if (caps.length) { en.push(`It supports ${listEn(caps)}.`); ja.push(`${capsJa.join("・")}に対応します。`); }

  const perf = [], perfJa = [];
  if (product.drIn) { perf.push(`${product.drIn} dB dynamic range (input)`); perfJa.push(`入力 DR ${product.drIn} dB`); }
  if (product.drOut) { perf.push(`${product.drOut} dB dynamic range (output)`); perfJa.push(`出力 DR ${product.drOut} dB`); }
  if (!product.drIn && !product.drOut && product.drUnknown) { perf.push(`${product.drUnknown} dB dynamic range`); perfJa.push(`DR ${product.drUnknown} dB`); }
  if (perf.length) { en.push(`Measured performance includes ${listEn(perf)}.`); ja.push(`実測性能は${perfJa.join("・")}。`); }

  if (product.price) {
    const price = fmtPrice(product.price);
    en.push(`Reference price: ${price}.`);
    ja.push(`参考価格は ${price} です。`);
  }

  return { en: en.join(" "), ja: ja.join("") };
}

// ─── Product page ────────────────────────────────────────────────────────
function productPage(product, allProducts, buildDate) {
  const pageUrl = `${SITE_URL}${BASE_PATH}products/${product.slug}/`;

  // Key specs for meta description (shares the same builder as the og:image spec line)
  const specParts = keySpecParts(product);
  const priceStr = product.price ? fmtPrice(product.price) : "";
  const specSuffix = specParts.length ? `: ${specParts.join(", ")}${priceStr ? `, ${priceStr}` : ""}` : (priceStr ? `: ${priceStr}` : "");
  const descEn = `${product.displayName} full specs${specSuffix}. Compare with ${allProducts.length - 1} other audio interfaces on Audio Interface Comparator.`;
  const jaSpecParts = [...specParts];
  if (priceStr) jaSpecParts.push(priceStr);
  const descJa = `${product.displayName} の詳細スペック${jaSpecParts.length ? "（" + jaSpecParts.join("、") + "）" : ""}。他 ${allProducts.length - 1} 製品と比較できます。`;

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

  // Spec table (2-column: label | value). Cells are rendered by cellFor, shared with compare.js
  let tableRows = "";
  for (const group of SPEC_GROUPS) {
    tableRows += `<tr class="group-header" id="${group.id}"><td colspan="2"><a href="#${group.id}" data-i18n-label="${escapeHtml(group.titleJa)}">${escapeHtml(group.title)}</a></td></tr>\n`;
    for (const key of group.keys) {
      const lab = KEY_LABELS[key] || { en: key, ja: key };
      tableRows += `<tr>
  <th scope="row" class="label-col" data-i18n-label="${escapeHtml(lab.ja)}">${escapeHtml(lab.en)}</th>
  <td class="val-col">${cellFor(product, key)}</td>
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

  // Comparisons are consolidated in the index page's fragment URL. It opens with the current product on the left (a).
  // Crawlers do not treat fragments as separate URLs, so no canonical-order sorting is needed
  function compareHref(other) {
    return `${BASE_PATH}#a=${encodeURIComponent(product.slug)}&b=${encodeURIComponent(other.slug)}`;
  }

  const compareLinkItems = [...sameBrand, ...otherBrand].map((other) => {
    const otherPrice = other.price ? ` · ${fmtPrice(other.price)}` : "";
    return `<li><a href="${escapeHtml(compareHref(other))}"><span class="brand">${escapeHtml(other.brand)}</span> ${escapeHtml(other.model)}<div class="meta">${escapeHtml(other.category || "")}${escapeHtml(otherPrice)}</div></a></li>`;
  }).join("\n");

  const summary = specSummary(product);
  const title = `${product.displayName} Specs — Audio Interface Comparator`;
  const ogp = { title: `${product.displayName} Specs`, description: descEn, url: pageUrl,
    image: `${SITE_URL}${BASE_PATH}og/products/${product.slug}.png` };
  const alternates = { enUrl: pageUrl, jaUrl: `${SITE_URL}${BASE_PATH}ja/products/${product.slug}/` };

  return `${htmlHead(title, `<meta name="description" content="${escapeHtml(descEn)}" data-i18n-content="metaDesc" data-i18n-val="${escapeHtml(descJa)}">\n<link rel="canonical" href="${escapeHtml(pageUrl)}">\n<script type="application/ld+json">${jsonLd}</script>`, ogp, alternates)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container header-bar">
    <div>
      <h1>${escapeHtml(product.displayName)} Specs</h1>
      <div class="subtitle"><a href="${BASE_PATH}" style="color:inherit;text-decoration:none">Audio Interface Comparator</a> — <span data-i18n="subtitleProduct">${allProducts.length} products covered</span></div>
    </div>
    ${langToggle(`${BASE_PATH}ja/products/${product.slug}/`, "ja")}
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

    <p class="product-summary" data-i18n-label="${escapeHtml(summary.ja)}">${escapeHtml(summary.en)}</p>

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
${i18nScripts({
  subtitleProduct: `全 ${allProducts.length} 製品を収録`,
  skipToMain: "メインコンテンツへスキップ",
  footer: `最終更新: ${buildDate} — データソース: 各メーカー公式仕様`,
})}
</body>
</html>`;
}

// ─── Hub pages (brand / category listings) ─────────────────────────────────
// Provides static internal links to the product pages, targeting both the crawl path and list-type queries.
// kind: "brand" | "category". items is the array of that brand's/category's products (already sorted in display order).
function hubPage(kind, name, slug, items, totalProducts, buildDate) {
  const isBrand = kind === "brand";
  const dir = isBrand ? "brands" : "categories";
  const titleEn = `${name} Audio Interfaces`;
  const titleJa = `${name} のオーディオインターフェース`;
  const pageUrl = `${SITE_URL}${BASE_PATH}${dir}/${slug}/`;
  const descEn = `All ${items.length} ${name} audio interface${items.length === 1 ? "" : "s"} — compare specs, inputs, outputs, and price. Part of a ${totalProducts}-product comparison.`;
  const descJa = `${name} のオーディオインターフェース ${items.length} 機種の一覧。スペック・入出力・価格を比較できます (全 ${totalProducts} 製品)。`;

  const itemListLd = safeJsonForScriptLD({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: titleEn,
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${BASE_PATH}products/${p.slug}/`,
      name: p.displayName,
    })),
  });

  const listItems = items.map((p) => {
    const price = p.price ? ` · ${fmtPrice(p.price)}` : "";
    // Brand hubs show the product name (model) as the main label; category hubs show brand+model
    const primary = isBrand
      ? `<span class="brand">${escapeHtml(p.brand)}</span> ${escapeHtml(p.model)}`
      : `<span class="brand">${escapeHtml(p.displayName)}</span>`;
    const secondary = isBrand ? escapeHtml(p.category || "") : escapeHtml(p.brand);
    return `<li><a href="${BASE_PATH}products/${p.slug}/">${primary}<div class="meta">${secondary}${escapeHtml(price)}</div></a></li>`;
  }).join("\n");

  const ogp = { title: titleEn, description: descEn, url: pageUrl,
    image: `${SITE_URL}${BASE_PATH}og/${dir}/${slug}.png` };
  const extra = `<meta name="description" content="${escapeHtml(descEn)}" data-i18n-content="metaDesc" data-i18n-val="${escapeHtml(descJa)}">\n<link rel="canonical" href="${escapeHtml(pageUrl)}">\n<script type="application/ld+json">${itemListLd}</script>`;
  const alternates = { enUrl: pageUrl, jaUrl: `${SITE_URL}${BASE_PATH}ja/${dir}/${slug}/` };

  return `${htmlHead(`${titleEn} — Audio Interface Comparator`, extra, ogp, alternates)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<div class="ai-disclaimer" data-i18n="aiDisclaimer">Specifications were collected with the assistance of AI and may contain errors. Please verify with official sources.</div>
<header>
  <div class="container header-bar">
    <div>
      <h1 data-i18n="hubTitle">${escapeHtml(titleEn)}</h1>
      <div class="subtitle"><a href="${BASE_PATH}" style="color:inherit;text-decoration:none">Audio Interface Comparator</a> — <span data-i18n="hubCount">${items.length} of ${totalProducts} products</span></div>
    </div>
    ${langToggle(`${BASE_PATH}ja/${dir}/${slug}/`, "ja")}
  </div>
</header>
<main id="main">
  <div class="container">
    <a class="back-link" href="${BASE_PATH}" data-i18n="backLink">← Back to product selection</a>
    <ul class="hub-list">
${listItems}
    </ul>
  </div>
</main>
<footer>
  <div class="container">
    <span data-i18n="footer">Last updated: ${escapeHtml(buildDate)} — Source: Official manufacturer specs</span>
    <br><a href="https://github.com/semnil/audio-interface-compare-site/issues" target="_blank" rel="noopener noreferrer" data-i18n="reportIssue">Report an issue</a>
  </div>
</footer>
${i18nScripts({
  hubTitle: titleJa,
  hubCount: `${totalProducts} 製品中 ${items.length} 件`,
  skipToMain: "メインコンテンツへスキップ",
  footer: `最終更新: ${buildDate} — データソース: 各メーカー公式仕様`,
})}
</body>
</html>`;
}

// ─── 404 page ────────────────────────────────────────────────────────────
// The static page GitHub Pages serves for a 404 on any path. Leads users who land on old comparison URLs (before the move to fragments)
// or old URLs from slug changes to index / sitemap with static links.
// No automatic redirect, since that is the soft 404 anti-pattern. noindex keeps the page itself from being indexed.
function notFoundPage() {
  const extra = `<meta name="robots" content="noindex">`;
  return `${htmlHead("Page not found — Audio Interface Comparator", extra)}
<body>
<a href="#main" class="skip-link" data-i18n="skipToMain">Skip to main content</a>
<header>
  <div class="container">
    <h1><a href="${BASE_PATH}">Audio Interface Comparator</a></h1>
  </div>
</header>
<main id="main">
  <div class="container">
    <div class="notfound">
      <p class="notfound-code">404</p>
      <h2 data-i18n="nf404Title">This page could not be found.</h2>
      <p data-i18n="nf404Body">The page may have moved or been removed. Comparisons are now generated on the fly — pick two products from the home page.</p>
      <p><a class="compare-btn" href="${BASE_PATH}" data-i18n="nf404Home">Go to product selection</a></p>
      <p><a href="${BASE_PATH}sitemap.xml" data-i18n="nf404Sitemap">Browse all product pages (sitemap)</a></p>
    </div>
  </div>
</main>
<footer>
  <div class="container">
    <a href="https://github.com/semnil/audio-interface-compare-site/issues" target="_blank" rel="noopener noreferrer" data-i18n="reportIssue">Report an issue</a>
  </div>
</footer>
${i18nScripts({
  skipToMain: "メインコンテンツへスキップ",
  nf404Title: "ページが見つかりませんでした",
  nf404Body: "ページが移動または削除された可能性があります。比較はその場で生成する方式に変わりました。トップページから 2 製品を選んでください。",
  nf404Home: "製品選択へ移動",
  nf404Sitemap: "全製品ページを見る (サイトマップ)",
})}
</body>
</html>`;
}

// ─── Main build ─────────────────────────────────────────────────────────
async function build() {
  console.time("build");
  const products = await readXlsx();
  console.log(`Read ${products.length} products`);

  const buildDate = new Date().toISOString().split("T")[0];

  // Clean dist (deletes existing files. Retries/skips when they are locked, e.g. by OneDrive)
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

  // Grouping by brand / category (for the hub pages + index's browse paths)
  const hubSlug = (name) => slugify(name, "");
  const groupBy = (getKey) => {
    const m = new Map();
    for (const p of products) {
      const key = getKey(p);
      if (!key) continue;
      if (!m.has(key)) m.set(key, { name: key, slug: hubSlug(key), items: [] });
      m.get(key).items.push(p);
    }
    const groups = [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const g of groups) g.items.sort((x, y) => x.displayName.localeCompare(y.displayName));
    return groups;
  };
  const brandGroups = groupBy((p) => p.brand);
  const categoryGroups = groupBy((p) => p.category);

  // Fail-fast guard for hub slug collisions (applies the same invariant as product slugs to the hub namespace).
  // Detected before generation, because distinct names collapsing into one slug would make writePair and the og images silently overwrite each other
  for (const groups of [brandGroups, categoryGroups]) {
    const seen = new Map();
    for (const g of groups) {
      if (seen.has(g.slug)) {
        throw new Error(`Hub slug collision: ${g.slug} from "${seen.get(g.slug)}" and "${g.name}"`);
      }
      seen.set(g.slug, g.name);
    }
  }

  // Helper that writes each page in 2 versions, English (root) and Japanese (/ja/).
  // For the Japanese version, localizeToJa() rewrites the English HTML's lang / internal URLs / canonical / toggle.
  const writePair = (enHtml, relPath) => {
    const enHref = `${BASE_PATH}${relPath}`;
    const jaHref = `${BASE_PATH}ja/${relPath}`;
    const enDir = join(DIST, relPath);
    mkdirSync(enDir, { recursive: true });
    writeFileSync(join(enDir, "index.html"), minifyHtml(enHtml));
    const jaDir = join(DIST, "ja", relPath);
    mkdirSync(jaDir, { recursive: true });
    // Only index has the inline PAGE_BASE (for specs-link)
    const jaHtml = localizeToJa(enHtml, enHref, jaHref, { hasInlineBase: relPath === "" });
    writeFileSync(join(jaDir, "index.html"), minifyHtml(jaHtml));
  };

  // 2. Index page (en + ja)
  writePair(indexPage(products, brandGroups, categoryGroups, buildDate), "");
  console.log("Wrote index.html (+ ja/)");

  // 3. Client-side compare renderer (dist/compare.js, shared)
  writeFileSync(join(DIST, "compare.js"), compareJs());
  console.log("Wrote compare.js");

  // Fail-fast guard for slug collisions. Product pages (dist/products/{slug}/) would be silently
  // overwritten on a collision, so it is always detected before generation (a build invariant)
  const slugMap = new Map();
  for (const p of products) {
    if (slugMap.has(p.slug)) {
      throw new Error(`Slug collision: ${p.slug} from ${p.brand} ${p.model}`);
    }
    slugMap.set(p.slug, p);
  }

  // 4. Product pages (one per product, en + ja)
  for (const product of products) {
    writePair(productPage(product, products, buildDate), `products/${product.slug}/`);
  }
  console.log(`Generated ${products.length} product pages (+ ja/)`);

  // 5. Hub pages (brand / category listings, en + ja)
  const hubSets = [
    { kind: "brand", dir: "brands", groups: brandGroups },
    { kind: "category", dir: "categories", groups: categoryGroups },
  ];
  for (const { kind, dir, groups } of hubSets) {
    for (const g of groups) {
      writePair(hubPage(kind, g.name, g.slug, g.items, products.length, buildDate), `${dir}/${g.slug}/`);
    }
  }
  console.log(`Generated ${brandGroups.length} brand + ${categoryGroups.length} category hub pages (+ ja/)`);

  // 6. sitemap.xml (index + product + hub, each en + ja)
  // Comparisons are fragment URLs and not crawl targets, so they are not in the sitemap
  const pagePaths = ["", ...products.map((p) => `products/${p.slug}/`),
    ...hubSets.flatMap(({ dir, groups }) => groups.map((g) => `${dir}/${g.slug}/`))];
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const path of pagePaths) {
    for (const prefix of [BASE_PATH, `${BASE_PATH}ja/`]) {
      sitemap += `  <url><loc>${SITE_URL}${prefix}${path}</loc><changefreq>monthly</changefreq></url>\n`;
    }
  }
  sitemap += `</urlset>\n`;
  writeFileSync(join(DIST, "sitemap.xml"), sitemap);
  console.log(`Wrote sitemap.xml (${pagePaths.length * 2} URLs: ${pagePaths.length} paths × en/ja)`);

  // 7. og:image (social share cards. Shared by en/ja, so not generated per language)
  // PNG encoding takes over 90% of the measured og step, so it is parallelized asynchronously per batch.
  // Within a batch the order "finish all drawing → start all encoding" is required (see drawOgCard's comment)
  mkdirSync(join(DIST, "og", "products"), { recursive: true });
  for (const { dir } of hubSets) mkdirSync(join(DIST, "og", dir), { recursive: true });
  const ogJobs = [
    {
      file: join(DIST, "og", "site.png"),
      opts: {
        title: "Audio Interface Comparator",
        subtitle: `${products.length} audio interfaces compared side by side`,
        specLine: "Specs · I/O · Audio performance · Price",
      },
    },
    ...products.map((p) => ({
      file: join(DIST, "og", "products", `${p.slug}.png`),
      opts: {
        title: p.displayName,
        subtitle: `${p.category || ""}${p.price ? ` · ${fmtPrice(p.price)}` : ""}`,
        specLine: keySpecParts(p).join(" · "),
      },
    })),
    ...hubSets.flatMap(({ dir, groups }) => groups.map((g) => ({
      file: join(DIST, "og", dir, `${g.slug}.png`),
      opts: {
        title: `${g.name} Audio Interfaces`,
        subtitle: `${g.items.length} product${g.items.length === 1 ? "" : "s"} compared`,
      },
    }))),
  ];
  const OG_BATCH = 8;
  for (let i = 0; i < ogJobs.length; i += OG_BATCH) {
    const batch = ogJobs.slice(i, i + OG_BATCH);
    // Keep the order: draw every canvas → encode all at once. Interleaving drawing and encoding makes
    // @napi-rs/canvas SIGSEGV on darwin arm64 (100% reproducible), so do not change it
    const canvases = batch.map((job) => drawOgCard(job.opts));
    const bufs = await Promise.all(canvases.map((c) => c.encode("png")));
    batch.forEach((job, k) => writeFileSync(job.file, bufs[k]));
  }
  console.log(`Wrote og images (${ogJobs.length}: 1 site + ${products.length} products + ${brandGroups.length + categoryGroups.length} hubs)`);

  // 8. robots.txt (Sitemap line only. Does not block crawling of comparison URLs — so as not to prevent the 404 from being confirmed)
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}${BASE_PATH}sitemap.xml\n`;
  writeFileSync(join(DIST, "robots.txt"), robots);
  console.log("Wrote robots.txt");

  // 9. 404.html (GitHub Pages' custom 404. No automatic redirect)
  writeFileSync(join(DIST, "404.html"), minifyHtml(notFoundPage()));
  console.log("Wrote 404.html");

  console.timeEnd("build");
}

// Start the build only when run directly as the entry point
// (prevents reading the xlsx as a side effect when a test imports it)
// pathToFileURL makes it match correctly on Windows (C:\\path\\to\\build.js) too
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build();
}

// Exports for tests (no effect on the production build)
export function _slugify(brand, model) { return slugify(brand, model); }
export function _escapeHtml(str) { return escapeHtml(str); }
export { COLUMNS, diffClass as _diffClass };

export function _renderMeasurements(val) { return renderMeasurements(val); }
