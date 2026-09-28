// tests/workflow-schedule.test.js
// build-deploy.yml のスケジュール契約: 月初の月曜のみビルドする
// cron は曜日 (5 番目) だけを指定し、日 (3 番目) は * のまま、日付の絞り込みは gate ジョブが行う
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = readFileSync(join(__dirname, "..", ".github", "workflows", "build-deploy.yml"), "utf8");

function cronExpressions(yaml) {
  return [...yaml.matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)].map(m => m[1].trim().split(/\s+/));
}

function jobBlock(yaml, name) {
  const m = yaml.match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n)*)`, "m"));
  return m ? m[1] : null;
}

describe("workflow-schedule: build-deploy.yml", () => {
  test("cron が日と曜日を同時に制限しないこと (OR 発火の防止)", () => {
    const crons = cronExpressions(WORKFLOW);
    assert.ok(crons.length > 0, "schedule の cron が見つからない");
    for (const fields of crons) {
      assert.equal(fields.length, 5, `cron のフィールド数が 5 でない: ${fields.join(" ")}`);
      const [, , dom, , dow] = fields;
      assert.ok(dom === "*" || dow === "*", `日と曜日を両方指定している: ${fields.join(" ")}`);
    }
  });

  test("cron が月曜のみ起動すること", () => {
    for (const [, , dom, , dow] of cronExpressions(WORKFLOW)) {
      assert.equal(dom, "*");
      assert.equal(dow, "1");
    }
  });

  test("gate が schedule 起動時に 1〜7 日のみ run=true を出すこと", () => {
    const gate = jobBlock(WORKFLOW, "gate");
    assert.ok(gate, "gate ジョブが無い");
    assert.match(gate, /\$EVENT" != "schedule"/);
    assert.match(gate, /date -u \+%-d\)" -le 7/);
    assert.match(gate, /run=true/);
  });

  test("build が gate の出力でゲートされること", () => {
    const build = jobBlock(WORKFLOW, "build");
    assert.ok(build, "build ジョブが無い");
    assert.match(build, /needs:\s*gate/);
    assert.match(build, /if:\s*needs\.gate\.outputs\.run == 'true'/);
  });
});
