// tests/workflow-pins.test.js
// .github/workflows/ の全 uses: が 40 桁のコミット SHA + バージョンコメント (# vX.Y.Z) でピンされていること
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = join(__dirname, "..", ".github", "workflows");
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

function usesLines() {
  return readdirSync(WORKFLOWS_DIR)
    .filter(f => /\.ya?ml$/.test(f))
    .flatMap(f => readFileSync(join(WORKFLOWS_DIR, f), "utf8").split("\n")
      .map((line, i) => ({ file: f, line: i + 1, m: line.match(/^\s*(?:-\s*)?uses:\s*(.+?)\s*$/) }))
      .filter(x => x.m)
      .map(x => ({ file: x.file, line: x.line, value: x.m[1] })));
}

describe("workflow-pins: サードパーティ Action の SHA ピン", () => {
  test("uses: が 1 件以上あること", () => {
    assert.ok(usesLines().length > 0, "uses: が見つからない");
  });

  test("全 uses: が 40 桁 SHA + バージョンコメントであること", () => {
    const bad = usesLines().filter(u => !u.value.startsWith("./") && !PINNED.test(u.value));
    assert.deepEqual(bad.map(u => `${u.file}:${u.line} ${u.value}`), []);
  });
});
