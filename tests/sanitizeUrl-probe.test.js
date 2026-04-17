// tests/sanitizeUrl-probe.test.js
// Round 3 の M-new-1 修正 (sanitizeUrl の new URL() ベース化) の追加境界値検証
// WHATWG URL パーサが受理する 'グレーゾーン' な入力への挙動を固定する
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// src/build.js と同一ロジック
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

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

describe("sanitizeUrl: WHATWG URL パーサ特有の挙動 (受理される奇妙な入力)", () => {
  test("'https:' スキームのみはパース失敗で空文字", () => {
    assert.equal(sanitizeUrl("https:"), "");
  });

  test("'https://' (ホストなし) はパース失敗で空文字", () => {
    assert.equal(sanitizeUrl("https://"), "");
  });

  test("'https:example.com' (スラッシュなし) は受理されて https://example.com/ になる", () => {
    // WHATWG URL は 'https:example.com' を 'https://example.com/' と解釈する
    // これは仕様準拠だが、意図しない動作に見える可能性あり。深層防御の escapeHtml で問題なし
    assert.equal(sanitizeUrl("https:example.com"), "https://example.com/");
  });

  test("内部空白を含む URL ('https://a.com  evil.com') はパース失敗で空文字", () => {
    // tab / newline 等の制御文字は WHATWG URL が自動除去するが、スペースは除去されずに失敗
    assert.equal(sanitizeUrl("https://   evil.com"), "");
  });

  test("NULL バイトを含む URL はパース失敗で空文字", () => {
    assert.equal(sanitizeUrl("https://a.com\u0000embed"), "");
  });

  test("プロトコル相対 URL '//evil.com' はパース失敗で空文字", () => {
    // new URL() は base なしではプロトコル相対を受理しない
    assert.equal(sanitizeUrl("//evil.com"), "");
  });

  test("'https:\\\\\\\\evil.com\\\\' (バックスラッシュ混在) は 'https://evil.com/' に正規化される", () => {
    // WHATWG URL はバックスラッシュをスラッシュに正規化する (仕様準拠)
    assert.equal(sanitizeUrl("https:\\\\evil.com\\"), "https://evil.com/");
  });

  test("IPv6 リテラル 'https://[::1]/' は http(s) スキームとして受理される", () => {
    assert.equal(sanitizeUrl("https://[::1]/"), "https://[::1]/");
  });

  test("認証情報付き 'https://user:pass@evil.com' は受理される (仕様上正しい URL)", () => {
    // これは意図せず認証情報が埋め込まれる SEO 上の問題はあるが、http(s) スキームなので通す
    // 実データでは入らない想定
    const out = sanitizeUrl("https://user:pass@evil.com");
    assert.ok(out.startsWith("https://"), `https スキームでない: ${out}`);
  });

  test("'https:' 直後に改行 + 属性脱出試行は WHATWG URL が改行を除去して処理", () => {
    // WHATWG URL は \r\n\t を自動除去するため、結果的に 'https://a.comonclick=alert/' になる
    const out = sanitizeUrl("https://a.com\nonclick=alert");
    // 結果に改行は残らない
    assert.equal(/[\r\n]/.test(out), false, `改行が残っている: ${JSON.stringify(out)}`);
    // http(s) スキームであることのみ保証
    assert.ok(/^https?:\/\//.test(out));
  });
});

describe("sanitizeUrl + escapeHtml: 属性脱出の最終防御 (深層防御)", () => {
  test("ダブルクォート混入 URL は URL パーサに受理される場合、escapeHtml で &quot; 化", () => {
    // URL: https://a.com"onclick="alert(1) をパースすると、ホスト内の " が残る実装がある
    const raw = sanitizeUrl('https://a.com"onclick="alert(1)');
    if (raw) {
      // 生の " が残っている場合でも、最終的に escapeHtml を通すと &quot; 化される
      const safe = escapeHtml(raw);
      assert.equal(safe.includes('"'), false,
        `escapeHtml 後も素の \" が残存: ${safe}`);
    }
  });

  test("JavaScript: スキームは sanitizeUrl で空文字 → escapeHtml で '' のまま", () => {
    assert.equal(escapeHtml(sanitizeUrl("javascript:alert(1)")), "");
  });

  test("data:text/html スキームは sanitizeUrl で空文字", () => {
    assert.equal(escapeHtml(sanitizeUrl("data:text/html,<script>alert(1)</script>")), "");
  });

  test("'>'' 攻撃パターン ('https://a.com><script>') は new URL() でパース失敗 → 空文字", () => {
    assert.equal(escapeHtml(sanitizeUrl("https://a.com><script>alert(1)</script>")), "");
  });

  test("href 属性に埋め込める URL は常に http(s):// で始まる (または空文字)", () => {
    const probes = [
      "https://a.com",
      "HTTPS://A.COM/PATH",
      "  http://a.com  ",
      "javascript:alert(1)",
      "data:text/html,xss",
      "file:///etc/passwd",
      "",
      null,
      undefined,
      42,
      "not a url",
    ];
    for (const p of probes) {
      const out = sanitizeUrl(p);
      assert.ok(out === "" || /^https?:\/\//.test(out),
        `${JSON.stringify(p)} → ${JSON.stringify(out)} が http(s):// で始まらない`);
    }
  });
});

describe("sanitizeUrl: 正規化の副作用 (冪等性)", () => {
  test("sanitizeUrl は冪等である (一度通した結果をもう一度通しても変わらない)", () => {
    const cases = [
      "https://example.com",
      "https://a.com/path?q=1",
      "HTTPS://A.COM",
      "https:example.com",
    ];
    for (const c of cases) {
      const once = sanitizeUrl(c);
      const twice = sanitizeUrl(once);
      assert.equal(once, twice, `冪等性違反: ${c} → ${once} → ${twice}`);
    }
  });

  test("末尾スラッシュ付与: 'https://example.com' は 'https://example.com/' に正規化", () => {
    // new URL(...).href はホスト末尾に / を付与する
    assert.equal(sanitizeUrl("https://example.com"), "https://example.com/");
  });

  test("クエリ / フラグメントはそのまま保持", () => {
    assert.equal(
      sanitizeUrl("https://example.com/x?q=1#section"),
      "https://example.com/x?q=1#section"
    );
  });
});
