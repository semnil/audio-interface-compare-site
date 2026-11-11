// tests/pins-output.test.js
// What tests/workflow-pins.test.js prints when it fails holds no ##[: the runner reads ##[ anywhere in a line of the log as a
// workflow command, and a uses value or the comment beside it is text a pull request wrote.
// Runs the pin test against a WORKFLOW_ROOT whose one workflow has an unpinned uses with ##[notice] in its value and in its comment.
// yq is required in CI; skipped when yq is not available locally
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const YQ = process.env.YQ || "yq";
const yqAvailable = spawnSync(YQ, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !yqAvailable && !process.env.CI ? `yq not available (${YQ})` : false;

function runPinTest(workflow) {
  const root = mkdtempSync(join(tmpdir(), "pins-output-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "w.yml"), workflow);
    // A test file run by `node --test` hands NODE_TEST_CONTEXT to its children, and a runner started under it reports to its parent
    // instead of printing and exiting on its own result.
    const env = { ...process.env, WORKFLOW_ROOT: root };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, ["--test", join(__dirname, "workflow-pins.test.js")], { encoding: "utf8", env });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const STEPS = "name: w\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n";

test("a failed pin test prints the entry it refused, with no ##[ in it", { skip }, () => {
  const r = runPinTest(`${STEPS}      - uses: "actions/checkout@v5##[notice]value" # ##[notice]comment\n`);
  const output = r.stdout + r.stderr;
  assert.notEqual(r.status, 0, "the pin test fails on an unpinned uses");
  assert.match(output, /w\.yml:7 /, "the refused entry is printed");
  assert.match(output, /## \[notice\]value/, "the value is printed with its ##[ broken apart");
  assert.match(output, /## \[notice\]comment/, "the comment is printed with its ##[ broken apart");
  assert.ok(!output.includes("##["), "no ##[ is left in the output");
});

test("a pinned uses with ##[ in its comment still fails the comment rule", { skip }, () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const r = runPinTest(`${STEPS}      - uses: actions/checkout@${sha} # ##[notice]comment\n`);
  const output = r.stdout + r.stderr;
  assert.notEqual(r.status, 0, "a comment that is not vX.Y.Z fails");
  assert.ok(!output.includes("##["), "no ##[ is left in the output");
});
