// tests/workflow-pins.test.js
// .github/workflows/ の jobs.<id>.uses と jobs.<id>.steps[*].uses が、40 桁のコミット SHA で終わり
// 同じ行のコメントが vX.Y.Z であること (ローカルの ./ 参照は対象外)。
// YAML は yq (環境変数 YQ で上書き可) で解析する。CI では yq 必須、ローカルに yq が無い場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = join(__dirname, "..", ".github", "workflows");
const YQ = process.env.YQ || "yq";
const USES = '(.jobs[] | select(has("uses")) | .uses), (.jobs[].steps[]? | select(has("uses")) | .uses)';
const QUERY = `[(${USES}) | {"line": line, "value": ., "comment": line_comment}]`;
const PINNED_VALUE = /^[^@\s]+@[0-9a-f]{40}$/;
const VERSION_COMMENT = /^v\d+\.\d+\.\d+$/;

const yqAvailable = spawnSync(YQ, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !yqAvailable && !process.env.CI ? `yq が無い (${YQ})` : false;

function usesEntries() {
  return readdirSync(WORKFLOWS_DIR)
    .filter(f => /\.ya?ml$/.test(f))
    .flatMap(f => {
      const r = spawnSync(YQ, ["-o=json", QUERY, join(WORKFLOWS_DIR, f)], { encoding: "utf8" });
      assert.equal(r.status, 0, `yq が ${f} を解析できない: ${r.stderr}`);
      return JSON.parse(r.stdout).map(e => ({ file: f, ...e }));
    });
}

describe("workflow-pins: サードパーティ Action の SHA ピン", () => {
  test("yq が実行できること", { skip }, () => {
    assert.ok(yqAvailable, `yq を実行できない (${YQ})`);
  });

  test("uses が 1 件以上あること", { skip }, () => {
    assert.ok(usesEntries().length > 0, "uses が見つからない");
  });

  test("全 uses の値が 40 桁 SHA で終わり、同じ行のコメントが vX.Y.Z であること", { skip }, () => {
    const bad = usesEntries().filter(e => !(typeof e.value === "string" && (e.value.startsWith("./") || (PINNED_VALUE.test(e.value) && VERSION_COMMENT.test(e.comment)))));
    assert.deepEqual(bad.map(e => `${e.file}:${e.line} ${JSON.stringify(e.value)} # ${e.comment}`), []);
  });
});
