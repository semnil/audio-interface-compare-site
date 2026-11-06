// tests/csp.test.js
// Every generated page carries a Content-Security-Policy meta tag before its first script, the tag lists the hash of each
// inline script on that page, and no markup relies on what the policy blocks (inline handlers and style attributes)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

function policyOf(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  return m ? m[1] : null;
}

describe("Content-Security-Policy", { skip: existsSync(DIST) ? false : "dist/ not built" }, () => {
  const pages = existsSync(DIST) ? htmlFiles(DIST) : [];

  test("the pages include the index, a Japanese page and the 404", () => {
    const names = pages.map((p) => p.slice(DIST.length + 1));
    assert.ok(names.includes("index.html"));
    assert.ok(names.includes(join("ja", "index.html")));
    assert.ok(names.includes("404.html"));
  });

  test("each page has one policy, right after the charset and before every script", () => {
    for (const p of pages) {
      const html = readFileSync(p, "utf8");
      assert.equal(html.split('http-equiv="Content-Security-Policy"').length, 2, `${p}: policy count`);
      assert.ok(html.includes('<meta charset="utf-8"><meta http-equiv="Content-Security-Policy"'), `${p}: policy position`);
      const first = html.indexOf("<script");
      if (first >= 0) assert.ok(html.indexOf("Content-Security-Policy") < first, `${p}: a script comes before the policy`);
    }
  });

  test("the policy allows only the site's origin and the page's own inline scripts", () => {
    for (const p of pages) {
      const directives = policyOf(readFileSync(p, "utf8")).split("; ");
      assert.ok(directives.includes("default-src 'none'"), `${p}: default-src`);
      assert.ok(directives.includes("style-src 'self'"), `${p}: style-src`);
      assert.ok(directives.includes("img-src 'self'"), `${p}: img-src`);
      assert.ok(directives.includes("connect-src 'self'"), `${p}: connect-src`);
      assert.ok(directives.includes("base-uri 'none'"), `${p}: base-uri`);
      assert.ok(directives.includes("form-action 'none'"), `${p}: form-action`);
      const script = directives.find((d) => d.startsWith("script-src"));
      assert.ok(/^script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')*$/.test(script), `${p}: script-src ${script}`);
    }
  });

  test("the policy lists exactly the hashes of the page's inline scripts", () => {
    let inlineSeen = 0;
    for (const p of pages) {
      const html = readFileSync(p, "utf8");
      const listed = policyOf(html).match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [];
      const inline = [];
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        const attrs = m[1];
        if (/\bsrc=/.test(attrs) || /type="application\/ld\+json"/.test(attrs)) continue;
        assert.equal(attrs.trim(), "", `${p}: an inline script with attributes: ${attrs}`);
        inline.push(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
      }
      inlineSeen += inline.length;
      assert.deepEqual(listed, inline, `${p}: hashes`);
    }
    assert.ok(inlineSeen > 0, "no inline script was read");
  });

  test("external scripts and stylesheets are served from the site itself", () => {
    for (const p of pages) {
      const html = readFileSync(p, "utf8");
      for (const m of html.matchAll(/<script src="([^"]+)"|<link rel="stylesheet" href="([^"]+)"/g)) {
        const url = m[1] ?? m[2];
        assert.ok(url.startsWith("/"), `${p}: ${url}`);
        assert.ok(!url.startsWith("//"), `${p}: ${url}`);
      }
    }
  });

  test("no page has a style attribute or an inline event handler", () => {
    for (const p of pages) {
      const html = readFileSync(p, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
      assert.equal(/<[^>]+\sstyle="/.test(html), false, `${p}: style attribute`);
      assert.equal(/<[^>]+\son[a-z]+="/.test(html), false, `${p}: inline event handler`);
    }
  });

  test("the markup that scripts insert has no style attribute or inline event handler", () => {
    const compare = readFileSync(join(DIST, "compare.js"), "utf8");
    const index = readFileSync(join(DIST, "index.html"), "utf8");
    const indexScripts = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    for (const [name, src] of [["compare.js", compare], ["index inline scripts", indexScripts]]) {
      assert.equal(/\sstyle=/.test(src), false, `${name}: style attribute`);
      assert.equal(/\son[a-z]+=["']/.test(src), false, `${name}: inline event handler`);
    }
  });
});
