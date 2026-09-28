// tests/workflow-pins.test.js
// .github/workflows/ の jobs.<id>.uses と jobs.<id>.steps[*].uses、および action.yml / action.yaml の
// runs.steps[*].uses が、40 桁のコミット SHA で終わり同じ行のコメントが vX.Y.Z であること
// (同一リポジトリ参照の ./ と $/ は対象外。参照先の action.yml / action.yaml は検査対象)。
// 検査対象のルートは WORKFLOW_ROOT (未設定ならリポジトリ直下)。WORKFLOW_ROOT 指定時はその配下の action.yml / action.yaml を、
// 未指定時は git ls-files の action.yml / action.yaml を対象にする。
// YAML は yq (環境変数 YQ で上書き可) で解析する。CI では yq 必須、ローカルに yq が無い場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.WORKFLOW_ROOT || join(__dirname, "..");
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");
const YQ = process.env.YQ || "yq";
const WORKFLOW_USES = '(.jobs[] | select(has("uses")) | .uses), (.jobs[].steps[]? | select(has("uses")) | .uses)';
const ACTION_USES = '(.runs.steps[]? | select(has("uses")) | .uses)';
const query = uses => `[(${uses}) | {"line": line, "value": ., "comment": line_comment}]`;
const PINNED_VALUE = /^[^@\s]+@[0-9a-f]{40}$/;
const VERSION_COMMENT = /^v\d+\.\d+\.\d+$/;
const ACTION_FILE = /(^|\/)action\.ya?ml$/;
const SAME_REPOSITORY = /^[.$]\//;

const yqAvailable = spawnSync(YQ, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !yqAvailable && !process.env.CI ? `yq が無い (${YQ})` : false;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

function actionFiles() {
  if (process.env.WORKFLOW_ROOT) return walk(ROOT).map(p => relative(ROOT, p)).filter(p => ACTION_FILE.test(p));
  const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z", "--", "action.yml", "action.yaml", "*/action.yml", "*/action.yaml"], { encoding: "utf8" });
  assert.equal(r.status, 0, `git ls-files が失敗: ${r.stderr}`);
  return r.stdout.split("\0").filter(Boolean);
}

function entries(file, uses) {
  const r = spawnSync(YQ, ["-o=json", query(uses), join(ROOT, file)], { encoding: "utf8" });
  assert.equal(r.status, 0, `yq が ${file} を解析できない: ${r.stderr}`);
  return JSON.parse(r.stdout).map(e => ({ file, ...e }));
}

function usesEntries() {
  const workflows = readdirSync(WORKFLOWS_DIR).filter(f => /\.ya?ml$/.test(f)).map(f => join(".github", "workflows", f));
  return [...workflows.flatMap(f => entries(f, WORKFLOW_USES)), ...actionFiles().flatMap(f => entries(f, ACTION_USES))];
}

describe("workflow-pins: サードパーティ Action の SHA ピン", () => {
  test("yq が実行できること", { skip }, () => {
    assert.ok(yqAvailable, `yq を実行できない (${YQ})`);
  });

  test("uses が 1 件以上あること", { skip }, () => {
    assert.ok(usesEntries().length > 0, "uses が見つからない");
  });

  test("全 uses の値が 40 桁 SHA で終わり、同じ行のコメントが vX.Y.Z であること", { skip }, () => {
    const bad = usesEntries().filter(e => !(typeof e.value === "string" && (SAME_REPOSITORY.test(e.value) || (PINNED_VALUE.test(e.value) && VERSION_COMMENT.test(e.comment)))));
    assert.deepEqual(bad.map(e => `${e.file}:${e.line} ${JSON.stringify(e.value)} # ${e.comment}`), []);
  });
});
