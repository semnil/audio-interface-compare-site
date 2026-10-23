// tests/deploy-gate.test.js
// build-deploy.yml publishes only what passed the tests: its build job runs npm ci, then npm test, then npm run build, and
// uploads the site after them, and the deploy job needs the build job and has no condition of its own.
// YAML is parsed with yq (overridable with the environment variable YQ). yq is required in CI; skipped when yq is not available locally
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = join(__dirname, "..", ".github", "workflows", "build-deploy.yml");
const YQ = process.env.YQ || "yq";

const yqAvailable = spawnSync(YQ, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !yqAvailable && !process.env.CI ? `yq not available (${YQ})` : false;

function read(expression) {
  const r = spawnSync(YQ, ["-o=json", "-I=0", expression, WORKFLOW], { encoding: "utf8" });
  assert.equal(r.status, 0, `yq failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

describe("deploy-gate: build-deploy.yml", { skip }, () => {
  test("the build job runs the tests after npm ci and before the build and the upload", () => {
    const steps = read(".jobs.build.steps");
    const at = matches => steps.findIndex(matches);
    const install = at(s => s.run === "npm ci");
    const tests = at(s => s.run === "npm test");
    const build = at(s => s.run === "npm run build");
    const upload = at(s => (s.uses || "").startsWith("actions/upload-pages-artifact@"));
    assert.deepEqual([install, tests, build, upload].map(i => i >= 0), [true, true, true, true], "a step is missing");
    assert.ok(install < tests && tests < build && build < upload, `steps out of order: ${[install, tests, build, upload]}`);
    assert.equal(steps[tests].if, undefined, "the test step has a condition");
    // Setting continue-on-error on the test step or on the build job fails this test (measured by mutation)
    assert.equal(steps[tests]["continue-on-error"], undefined, "the test step continues on error");
    assert.equal(read(".jobs.build")["continue-on-error"], undefined, "the build job continues on error");
  });

  test("the deploy job needs the build job and has no condition of its own", () => {
    const deploy = read(".jobs.deploy");
    assert.deepEqual([deploy.needs].flat(), ["build"]);
    assert.equal(deploy.if, undefined);
  });
});
