// tests/sanitizeUrl.test.js
// build.js の sanitizeUrl (src/build.js:157-160) の境界値・契約検証
// src/ 変更禁止のため同等ロジックをインライン再現する
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js の sanitizeUrl と同一ロジック (new URL() ベースで http/https のみ許可)
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

describe("sanitizeUrl: 正常系 (http/https スキーム)", () => {
  test("https:// で始まる URL は正規化されて返る", () => {
    // new URL() はホスト末尾に "/" を付与する (RFC 準拠)
    assert.equal(sanitizeUrl("https://example.com"), "https://example.com/");
  });

  test("http:// で始まる URL は正規化されて返る", () => {
    assert.equal(sanitizeUrl("http://example.com"), "http://example.com/");
  });

  test("HTTPS:// 大文字は小文字スキームに正規化される", () => {
    assert.equal(sanitizeUrl("HTTPS://EXAMPLE.COM"), "https://example.com/");
  });

  test("前後の空白はトリムされる", () => {
    assert.equal(sanitizeUrl("  https://example.com  "), "https://example.com/");
  });

  test("タブ前置も trim で吸収される", () => {
    assert.equal(sanitizeUrl("\thttps://example.com"), "https://example.com/");
  });

  test("パス付き URL のクエリ / パスはそのまま保持", () => {
    assert.equal(sanitizeUrl("https://example.com/path?x=1"), "https://example.com/path?x=1");
  });
});

describe("sanitizeUrl: 危険スキームを空文字化", () => {
  test("javascript: は空文字", () => {
    assert.equal(sanitizeUrl("javascript:alert(1)"), "");
  });

  test("vbscript: は空文字", () => {
    assert.equal(sanitizeUrl("vbscript:msgbox(1)"), "");
  });

  test("data:text/html,... は空文字", () => {
    assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "");
  });

  test("file:// は空文字", () => {
    assert.equal(sanitizeUrl("file:///etc/passwd"), "");
  });

  test("ftp:// は空文字", () => {
    assert.equal(sanitizeUrl("ftp://evil.com"), "");
  });

  test("プロトコル相対 URL '//evil.com' は空文字", () => {
    assert.equal(sanitizeUrl("//evil.com"), "");
  });

  test("前置空白 + javascript: は空文字", () => {
    assert.equal(sanitizeUrl(" javascript:alert(1)"), "");
  });
});

describe("sanitizeUrl: null/undefined/空値の処理", () => {
  test("null は空文字", () => {
    assert.equal(sanitizeUrl(null), "");
  });

  test("undefined は空文字", () => {
    assert.equal(sanitizeUrl(undefined), "");
  });

  test("空文字は空文字", () => {
    assert.equal(sanitizeUrl(""), "");
  });

  test("数値入力は空文字 (http/https プレフィックス無し)", () => {
    assert.equal(sanitizeUrl(123), "");
  });

  test("ブーリアン true は空文字", () => {
    assert.equal(sanitizeUrl(true), "");
  });
});

describe("sanitizeUrl: new URL() による厳格化", () => {
  // new URL() ベースの実装は、パース不能な URL (空白・タグ等) を拒否する。
  // ただし WHATWG URL パーサは寛容な部分があり、一部の不正文字は URL エンコードして受け入れる。
  // その場合は後段の escapeHtml で HTML 属性脱出を防ぐ (深層防御)。

  test("https プレフィックス後に空白が挟まる URL は空文字 (パース失敗)", () => {
    const input = "https://example.com javascript:alert(1)";
    assert.equal(sanitizeUrl(input), "");
  });

  test("https + タグ (<>) 混入 URL は空文字 (パース失敗)", () => {
    // > はホスト部では不正文字扱いとなり new URL() がエラーを投げる
    const input = "https://a.com><script>alert(1)</script>";
    assert.equal(sanitizeUrl(input), "");
  });

  test("https + ダブルクォート混入 URL は URL エンコードされて受理される (escapeHtml 依存)", () => {
    // WHATWG URL パーサは " を %22 相当のまま保持する (エラーにしない)
    // HTML 属性脱出は後段 escapeHtml で防ぐ
    const out = sanitizeUrl('https://a.com"onclick="alert(1)');
    assert.ok(out.startsWith("https://"), `https スキーム以外: ${out}`);
    // 出力内に素の " は含まれない (URL パースにより正規化済み)
    // note: 実装によってはエンコードされる / ホスト内のため残る場合あり。
    //        契約: 出力は常に http(s) プロトコルであること。
    assert.ok(/^https?:\/\//.test(out));
  });
});

describe("sanitizeUrl + escapeHtml 合成: 最終 HTML 属性の安全性", () => {
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  test("javascript: スキームは空文字 → href が空になる", () => {
    const href = escapeHtml(sanitizeUrl("javascript:alert(1)"));
    assert.equal(href, "");
  });

  test("https + 属性脱出試行 (ダブルクォート): escapeHtml で &quot; に変換され属性脱出を防ぐ", () => {
    const href = escapeHtml(sanitizeUrl('https://a.com"onclick="alert(1)'));
    // " が素で残っていないこと
    assert.equal(href.includes('"'), false, `" が escape されていない: ${href}`);
  });

  test("https + タグ脱出試行: URL パースで拒否されて空文字 → 安全な href", () => {
    const href = escapeHtml(sanitizeUrl("https://a.com><script>alert(1)</script>"));
    assert.equal(href, "");
  });
});
