# QuiqSec

QuiqSec is a local-first security guardrail, scanner, runtime shield, and dashboard for AI-assisted coding workflows. The v2 build keeps one shared engine behind the CLI, MCP server, dashboard, and local telemetry.

Current scope in this repo is local-first: prompt guardrails, scan and verify commands, dependency and source scanning, deploy-shield checks, MCP integration templates, runtime log analysis, the local dashboard, snapshots, rollback, and SARIF output. Cloud-hosted accounts, OAuth, multi-user sync, and live provider API automation remain future work.

## Zero-Touch Guardrails (Primary UX)

QuiqSec is designed to run as a background guardrail layer, not a copy-paste workflow.

In normal use, users keep coding in their IDE and QuiqSec handles security hooks automatically:

1. IDE sends prompt/tool events to QuiqSec through MCP.
2. QuiqSec intercepts the prompt (`beforeSubmitPrompt`), injects security guardrails, and returns the modified prompt to the IDE.
3. IDE continues generation with the guarded prompt without user action.
4. After edits (`afterFileEdit`), QuiqSec runs scans and optional intent verification.
5. Results are surfaced in the IDE/dashboard and persisted locally.

The `quiqsec guard` CLI command exists as a fallback/debug utility for environments where MCP hooks are not active.

## Quick Start

```bash
npm install
npm run build
npm link
quiqsec.cmd init
quiqsec.cmd scan .
```

PowerShell may block the generated `quiqsec.ps1` shim. Use `quiqsec.cmd` on Windows unless your execution policy allows local scripts.

## Commands

```bash
quiqsec init
quiqsec setup [--ide=auto|cursor|claude_code|vscode|continue|windsurf] [--apply|--repair]
quiqsec scan [paths...] [--semgrep] [--gitleaks] [--timeout=5000] [--format=pretty|json|sarif] [--output=file]
quiqsec guard --prompt "Create a login endpoint" [--format=pretty|json]
quiqsec verify --prompt "Create a login endpoint" [paths...] [--format=pretty|json]
quiqsec runtime --logs runtime.log [--format=pretty|json]
quiqsec dashboard [--port=4174]
quiqsec integrations templates [--format=pretty|json]
quiqsec integrations doctor [--ide=auto|cursor|claude_code|vscode|continue|windsurf]
quiqsec integrations repair [--ide=auto|cursor|claude_code|vscode|continue|windsurf]
quiqsec deploy [path] [--apply] [--format=pretty|json]
quiqsec cloud status|enable|disable|endpoint --endpoint URL|login --token TOKEN|login --device-code CODE|sync
quiqsec team list|add --name NAME --role owner|admin|developer|viewer [--email EMAIL]|remove --id MEMBER_ID
quiqsec report --health [--format=pretty|json]
quiqsec snapshot
quiqsec rollback [--dry-run|--yes]
```

`pretty` is the default scan format. It prints a readable terminal summary, colorizes status when supported, and shows an interactive spinner while scans run in a terminal.

`scan` exits with code `1` when any critical issue exists, or when more than two high-severity issues exist. It exits with code `2` on execution errors.

`guard` rewrites a coding prompt with task-specific security instructions. This is primarily a fallback/debug command. In zero-touch mode, the MCP server applies the same logic automatically during `beforeSubmitPrompt`. `verify` checks generated files against the original prompt, then combines intent verification with the normal security scan.

`dashboard` starts the local v2 dashboard. It reads the same `.quiqsec/` state as the CLI: latest scan, health history, workspace metadata, telemetry, and runtime anomaly results.

`setup` installs and normalizes local IDE MCP config so interception can run without manual copy-paste. `setup --apply` (or `--repair`) performs repair mode.

`runtime` analyzes application logs locally and stores runtime anomaly results for the dashboard.

`integrations templates` prints local MCP config snippets for Cursor, Claude Code, VS Code, Continue, and Windsurf. `integrations doctor` validates that interception wiring is healthy. `integrations repair` auto-fixes MCP config drift.

When those templates are installed in an MCP-capable IDE, prompt interception and reinjection are automatic. Users should not need to manually copy modified prompts in the normal path.

`scan --semgrep --gitleaks` optionally runs external scanners when they are installed on PATH. If a tool is missing or times out, QuiqSec keeps scanning with built-in rules and records the tool error in telemetry.

`deploy` runs a local deploy-shield pass over Vercel, Supabase, Railway, and Fly configuration files. It flags missing security headers, hardcoded deploy secrets, insecure URLs, and Supabase RLS gaps when those config files exist. `deploy --apply` auto-remediates common config issues (for example adding missing Vercel security headers and upgrading Supabase site_url to HTTPS) before the final check.

`cloud` is an opt-in sync flow for local health/summary metrics. Configure endpoint and token, then run `quiqsec cloud sync`.

`team` manages workspace members in local state for shared review workflows.

`scan` also checks dependency manifests and lockfiles for risky lifecycle scripts, git/file/http package sources, broad version ranges, known risky packages, and typosquat candidates.

## License And Contributions

QuiqSec core code is MIT licensed. See [LICENSE](LICENSE) for the full text.

Community contributions are accepted under the terms in [CLA.md](CLA.md). In short, you confirm you have the right to submit the work, and you grant the project the rights needed to use, modify, and redistribute it under the MIT License.

Commercial cloud features are opt-in and currently scoped to summary sync endpoints. Hosted dashboards and full multi-workspace account management are still in progress.

Open-core packaging and monetization planning is documented in [QuiqSec-Monetization-Strategy.md](QuiqSec-Monetization-Strategy.md).

Repository split planning artifacts:
- [QuiqSec-Repo-Split-Ownership-Matrix.md](QuiqSec-Repo-Split-Ownership-Matrix.md)
- [QuiqSec-Repo-Split-Migration-Checklist.md](QuiqSec-Repo-Split-Migration-Checklist.md)
- [QuiqSec-Contract-Interfaces.md](QuiqSec-Contract-Interfaces.md)

## Local Files

QuiqSec stores local metadata under `.quiqsec/`:

```text
.quiqsec/config.json
.quiqsec/findings.json
.quiqsec/history.json
.quiqsec/collaboration.json
.quiqsec/runtime.json
.quiqsec/snapshots.json
.quiqsec/telemetry.json
.quiqsec/workspace.json
```

No source code or secrets are sent to cloud services by default.

## Rules

QuiqSec loads its built-in rule pack from:

```text
rules/base-rules.json
```

Project-specific rules can be added without code changes by editing `.quiqsec/config.json`:

```json
{
  "rules": {
    "paths": ["security/custom-rules.json"]
  }
}
```

Custom rule files use the same JSON format:

```json
[
  {
    "id": "project-no-debug-route",
    "description": "Debug route exposed in application code",
    "pattern": "app\\.get\\s*\\(\\s*['\\\"]/debug",
    "severity": "high",
    "fixTemplate": "Remove debug routes or protect them behind admin-only authentication."
  }
]
```
