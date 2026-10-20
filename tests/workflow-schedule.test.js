// tests/workflow-schedule.test.js
// Trigger contract of build-deploy.yml: starts only on push (main) and workflow_dispatch, and has no schedule trigger
// The root of what is checked is WORKFLOW_ROOT (the repository root when unset)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.WORKFLOW_ROOT || join(__dirname, "..");
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "build-deploy.yml"), "utf8");

function onBlock(yaml) {
  const m = yaml.match(/^on:\n((?:[ \t]+.*\n|[ \t]*\n)*)/m);
  return m ? m[1] : null;
}

describe("workflow-schedule: build-deploy.yml", () => {
  test("has no schedule trigger", () => {
    const on = onBlock(WORKFLOW);
    assert.ok(on, "on: block not found");
    assert.doesNotMatch(on, /^\s*schedule:/m);
    assert.doesNotMatch(WORKFLOW, /^\s*-\s*cron:/m);
  });

  test("starts on push and workflow_dispatch", () => {
    const on = onBlock(WORKFLOW);
    assert.match(on, /^  workflow_dispatch:/m);
    assert.match(on, /^  push:/m);
  });
});
