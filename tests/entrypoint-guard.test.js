// tests/entrypoint-guard.test.js
// build.js の L1 修正で追加された entrypoint ガード (src/build.js:1104) の検証
// テストから import しても build() が自動実行されないこと、
// および Windows 環境での既知の互換性制約を明示する。
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD_SRC = join(ROOT, "src", "build.js");

describe("build.js: エントリポイントガード", () => {
  test("import.meta.url と pathToFileURL(process.argv[1]).href を比較するガードが存在する", () => {
    const src = readFileSync(BUILD_SRC, "utf8");
    assert.ok(/import\.meta\.url\s*===\s*pathToFileURL\(\s*process\.argv\[1\]\s*\)\.href/.test(src),
      "pathToFileURL ベースのエントリポイントガードが src/build.js に存在しない");
  });

  test("build() 呼び出しがガード内にあり、top-level には出ないこと", () => {
    const src = readFileSync(BUILD_SRC, "utf8");
    // build() 呼び出しの前に必ずガード文が存在する
    const buildCallIdx = src.indexOf("build();");
    assert.ok(buildCallIdx > 0, "build() 呼び出しが見つからない");
    // ガード文は build() 呼び出しの直前にある
    const snippetBefore = src.slice(Math.max(0, buildCallIdx - 200), buildCallIdx);
    assert.ok(/if\s*\([^)]*import\.meta\.url/.test(snippetBefore),
      `build() 呼び出しの直前にガード文が無い: ${snippetBefore}`);
  });

  test("動的 import ({/* no-op */}) すると build() は起動せず exports のみ取得できる", async () => {
    // 既存テスト (diffClass.test.js) は import が副作用なしに行えることを前提にしている
    // 副作用が走ると 20 秒以上のビルド時間がかかるため、短時間で import 完了するかで判定
    const start = Date.now();
    const mod = await import(BUILD_SRC);
    const elapsed = Date.now() - start;
    // 1 秒以内に import 完了することを確認 (xlsx 読み込みは数秒かかる)
    assert.ok(elapsed < 1500, `import が ${elapsed}ms と遅い → build() が副作用で走った可能性`);
    // export 確認
    assert.equal(typeof mod._slugify, "function");
    assert.equal(typeof mod._escapeHtml, "function");
    assert.equal(typeof mod._diffClass, "function");
    assert.ok(Array.isArray(mod.COLUMNS));
  });

  test("Windows 互換性: pathToFileURL を利用してバックスラッシュ形式の argv[1] を正規化すること", () => {
    // Node.js 公式イディオム: url.pathToFileURL(process.argv[1]).href === import.meta.url
    // 旧実装の `file://${process.argv[1]}` 文字列連結では Windows の
    //   process.argv[1]: C:\\path\\to\\build.js
    //   `file://${...}`: file://C:\\path\\to\\build.js
    //   import.meta.url: file:///C:/path/to/build.js
    // で不一致となり、直接実行でも build() が起動しなかった。
    // 現実装は pathToFileURL で URL 化して比較するため Windows でも動作する。
    const src = readFileSync(BUILD_SRC, "utf8");
    assert.ok(/pathToFileURL/.test(src),
      "ガードが pathToFileURL を利用していない (Windows 互換性のため必須)");
    // 旧来の文字列連結 `file://${process.argv[1]}` は残っていないこと
    assert.equal(/`file:\/\/\$\{process\.argv\[1\]\}`/.test(src), false,
      "旧来の file:// 文字列連結が残存 (Windows では誤判定する)");
  });
});
