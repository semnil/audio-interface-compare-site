// tests/deploy-gate.test.js
// build-deploy.yml publishes only what passed the tests on the site it built: its build job runs npm ci, then npm run build,
// then npm test, and uploads the site after them, and the deploy job needs the build job and has no condition of its own.
// ci.yml likewise runs npm test after npm run build. The suites that read dist/ skip when it does not exist, so a test run
// before the build would not check the built site.
// YAML is parsed with yq (overridable with the environment variable YQ). yq is required in CI; skipped when yq is not available locally
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(__dirname, "..", ".github", "workflows");
const YQ = process.env.YQ || "yq";

const yqAvailable = spawnSync(YQ, ["--version"], { encoding: "utf8" }).status === 0;
const skip = !yqAvailable && !process.env.CI ? `yq not available (${YQ})` : false;

function read(file, expression) {
  const r = spawnSync(YQ, ["-o=json", "-I=0", expression, join(WORKFLOWS, file)], { encoding: "utf8" });
  assert.equal(r.status, 0, `yq failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// The positions of npm ci, npm run build and npm test in the steps, and that each is present
function order(steps) {
  const at = matches => steps.findIndex(matches);
  const found = { install: at(s => s.run === "npm ci"), build: at(s => s.run === "npm run build"), tests: at(s => s.run === "npm test") };
  for (const [name, i] of Object.entries(found)) assert.ok(i >= 0, `the ${name} step is missing`);
  return found;
}

describe("deploy-gate: build-deploy.yml", { skip }, () => {
  test("the build job runs the tests after npm ci and the build, and before the upload", () => {
    const steps = read("build-deploy.yml", ".jobs.build.steps");
    const { install, build, tests } = order(steps);
    const upload = steps.findIndex(s => (s.uses || "").startsWith("actions/upload-pages-artifact@"));
    assert.ok(upload >= 0, "the upload step is missing");
    assert.ok(install < build && build < tests && tests < upload, `steps out of order: ${[install, build, tests, upload]}`);
    assert.equal(steps[tests].if, undefined, "the test step has a condition");
    // Setting continue-on-error on the test step or on the build job fails this test (measured by mutation)
    assert.equal(steps[tests]["continue-on-error"], undefined, "the test step continues on error");
    assert.equal(read("build-deploy.yml", ".jobs.build")["continue-on-error"], undefined, "the build job continues on error");
  });

  test("the deploy job needs the build job and has no condition of its own", () => {
    const deploy = read("build-deploy.yml", ".jobs.deploy");
    assert.deepEqual([deploy.needs].flat(), ["build"]);
    assert.equal(deploy.if, undefined);
  });
});

describe("deploy-gate: ci.yml", { skip }, () => {
  test("the test job runs the tests after npm ci and the build", () => {
    const { install, build, tests } = order(read("ci.yml", ".jobs.test.steps"));
    assert.ok(install < build && build < tests, `steps out of order: ${[install, build, tests]}`);
  });
});
