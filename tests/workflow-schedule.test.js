// tests/workflow-schedule.test.js
// build-deploy.yml のトリガー契約: push (main) と workflow_dispatch のみで起動し、schedule トリガーを持たない
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = readFileSync(join(__dirname, "..", ".github", "workflows", "build-deploy.yml"), "utf8");

function onBlock(yaml) {
  const m = yaml.match(/^on:\n((?:[ \t]+.*\n|[ \t]*\n)*)/m);
  return m ? m[1] : null;
}

describe("workflow-schedule: build-deploy.yml", () => {
  test("schedule トリガーを持たないこと", () => {
    const on = onBlock(WORKFLOW);
    assert.ok(on, "on: ブロックが見つからない");
    assert.doesNotMatch(on, /^\s*schedule:/m);
    assert.doesNotMatch(WORKFLOW, /^\s*-\s*cron:/m);
  });

  test("push と workflow_dispatch で起動すること", () => {
    const on = onBlock(WORKFLOW);
    assert.match(on, /^  workflow_dispatch:/m);
    assert.match(on, /^  push:/m);
  });
});
