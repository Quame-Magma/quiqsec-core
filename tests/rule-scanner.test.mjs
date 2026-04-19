import test from "node:test";
import assert from "node:assert/strict";
import { scanTextWithRules } from "../dist/scanner/ruleScanner.js";
import { loadRules } from "../dist/rules/loadRules.js";

test("rule scanner detects key MVP vulnerabilities", async () => {
  const rules = await loadRules(process.cwd());
  const sqlLine = '  const rows = await db.que' + 'ry("SELECT * FROM users WHERE id=" + req.body.id);';
  const logLine = "  console." + "log(process.env.PASSWORD);";
  const cookieLine = '  res.coo' + 'kie("sid", "value", { secure: false, httpOnly: false });';
  const loginLine = 'app.po' + 'st("/login", async (req, res) => {';
  const evalLine = "ev" + "al(req.body.code);";
  const passwordLine = `const pass${"word"} = "${"super"}${"secret"}${"password"}";`;
  const source = [
    loginLine,
    sqlLine,
    logLine,
    cookieLine,
    "});",
    `const key = "AKIA${"ABCDEFGHIJKLMNOP"}";`,
    passwordLine,
    evalLine
  ].join("\n");
  const findings = scanTextWithRules("generated-vulnerable-sample.js", source, rules);
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("no-sql-injection"), true);
  assert.equal(ruleIds.has("hardcoded-aws-key"), true);
  assert.equal(ruleIds.has("secret-in-log"), true);
  assert.equal(ruleIds.has("no-eval"), true);
  assert.equal(ruleIds.has("hardcoded-db-password"), true);
});

test("rule scanner redacts secret evidence", () => {
  const rules = [
    {
      id: "hardcoded-aws-key",
      description: "Hardcoded AWS access key",
      pattern: "AKIA[0-9A-Z]{16}",
      severity: "critical",
      fixTemplate: "Move AWS credentials to environment variables or a secret manager."
    }
  ];
  const secret = `AKIA${"ABCDEFGHIJKLMNOP"}`;
  const findings = scanTextWithRules("secret.js", `const key = '${secret}';`, rules);

  assert.equal(findings[0].evidence?.includes(secret), false);
});
