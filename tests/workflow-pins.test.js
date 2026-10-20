// tests/workflow-pins.test.js
// jobs.<id>.uses and jobs.<id>.steps[*].uses in .github/workflows/, and runs.steps[*].uses in action.yml / action.yaml,
// end in a 40-character commit SHA, and the comment on the same line is vX.Y.Z
// (same-repository references ./ and $/ are exempt; the action.yml / action.yaml they point to are checked).
// The root of what is checked is WORKFLOW_ROOT (the repository root when unset). With WORKFLOW_ROOT set, the action.yml / action.yaml under it are checked,
// and when unset, the action.yml / action.yaml from git ls-files. A name that matches when case is ignored but is not lowercase
// (Action.yml, etc.) fails.
// YAML is parsed with yq (overridable with the environment variable YQ). yq is required in CI; skipped when yq is not available locally
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
const ACTION_FILE_ANY_CASE = /(^|\/)action\.ya?ml$/i;
const SAME_REPOSITORY = /^[.$]\//;

const yqAvailable = spawnSync(YQ, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !yqAvailable && !process.env.CI ? `yq not available (${YQ})` : false;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

// Files matching action.yml / action.yaml when case is ignored (under WORKFLOW_ROOT when set, git's tracked files when unset)
function actionFileCandidates() {
  if (process.env.WORKFLOW_ROOT) return walk(ROOT).map(p => relative(ROOT, p)).filter(p => ACTION_FILE_ANY_CASE.test(p));
  const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8" });
  assert.equal(r.status, 0, `git ls-files failed: ${r.stderr}`);
  return r.stdout.split("\0").filter(p => ACTION_FILE_ANY_CASE.test(p));
}

function actionFiles() {
  return actionFileCandidates().filter(p => ACTION_FILE.test(p));
}

function entries(file, uses) {
  const r = spawnSync(YQ, ["-o=json", query(uses), join(ROOT, file)], { encoding: "utf8" });
  assert.equal(r.status, 0, `yq cannot parse ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout).map(e => ({ file, ...e }));
}

function usesEntries() {
  const workflows = readdirSync(WORKFLOWS_DIR).filter(f => /\.ya?ml$/.test(f)).map(f => join(".github", "workflows", f));
  return [...workflows.flatMap(f => entries(f, WORKFLOW_USES)), ...actionFiles().flatMap(f => entries(f, ACTION_USES))];
}

describe("workflow-pins: SHA pins of third-party Actions", () => {
  test("yq can be run", { skip }, () => {
    assert.ok(yqAvailable, `cannot run yq (${YQ})`);
  });

  test("action file names are lowercase action.yml / action.yaml", () => {
    assert.deepEqual(actionFileCandidates().filter(p => !ACTION_FILE.test(p)), []);
  });

  test("there is at least one uses", { skip }, () => {
    assert.ok(usesEntries().length > 0, "no uses found");
  });

  test("every uses value ends in a 40-character SHA and the comment on the same line is vX.Y.Z", { skip }, () => {
    const bad = usesEntries().filter(e => !(typeof e.value === "string" && (SAME_REPOSITORY.test(e.value) || (PINNED_VALUE.test(e.value) && VERSION_COMMENT.test(e.comment)))));
    assert.deepEqual(bad.map(e => `${e.file}:${e.line} ${JSON.stringify(e.value)} # ${e.comment}`), []);
  });
});
