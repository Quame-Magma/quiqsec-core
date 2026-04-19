# QuiqSec Contract Interfaces (Freeze Spec)

## Purpose

This document defines the contracts that should be considered stable before and after splitting into public core and private commercial repos.

## 1. CLI Contract (User-Facing)

Source of truth:
- [src/cli/index.ts](src/cli/index.ts)

Stable commands to preserve:
- init
- setup
- scan
- guard (fallback/debug)
- verify
- runtime
- dashboard
- integrations templates|doctor|repair
- deploy
- cloud
- team
- report --health
- snapshot
- rollback

Contract rules:
1. Preserve exit code semantics for scan/deploy/verify.
2. Preserve fallback-safe behavior when cloud is disabled.
3. Preserve setup/doctor/repair automation UX.

## 2. MCP Message Contract

Source of truth:
- [src/types.ts](src/types.ts)
- [src/server/handlers.ts](src/server/handlers.ts)

Stable message envelope:
- id
- type
- payload

Stable message types to preserve:
- beforeSubmitPrompt
- afterFileEdit
- stop
- scanRequest
- verifyIntent
- ping

Behavioral contract:
1. beforeSubmitPrompt returns guarded prompt payload.
2. afterFileEdit returns findings + health + blocked + optional verification.
3. ping updates and returns hook health signal.

## 3. Scan Report Contract

Source of truth:
- [src/types.ts](src/types.ts)
- [src/scanner/index.ts](src/scanner/index.ts)

Stable objects:
- ScanResult
- ScanReport
- HealthReport
- IssueSummary

Behavioral contract:
1. blocked=true when policy threshold is crossed.
2. Health score uses weighted severity model.
3. External scanner failures must not prevent local scan completion.

## 4. Policy Contract

Source of truth:
- [src/policy.ts](src/policy.ts)

Stable policy rules:
1. Block on any critical issue.
2. Block when high severity count > 2.
3. Health score clamped to [0,100].

## 5. Storage Contract

Source of truth:
- [src/config.ts](src/config.ts)
- [src/storage.ts](src/storage.ts)

Stable local files under .quiqsec:
- config.json
- findings.json
- history.json
- collaboration.json
- runtime.json
- snapshots.json
- telemetry.json
- workspace.json
- mcp-health.json

Behavioral contract:
1. Core commands remain functional if cloud is disabled.
2. JSON schemas evolve via additive fields when possible.
3. Retention windows remain deterministic for history and telemetry.

## 6. Integration Setup Contract

Source of truth:
- [src/integrations/setup.ts](src/integrations/setup.ts)
- [src/integrations/templates.ts](src/integrations/templates.ts)

Stable expectations:
1. setup writes/repairs mcpServers.quiqsec entry.
2. doctor validates command and args wiring.
3. repair normalizes drift without manual edits.

## 7. Deploy Shield Contract

Source of truth:
- [src/integrations/deployShield.ts](src/integrations/deployShield.ts)

Stable expectations:
1. Analyze returns deterministic summary and blocked state.
2. apply mode only performs safe local config remediations.
3. Findings include severity/category/recommendation fields.

## 8. Runtime Shield Contract

Source of truth:
- [src/runtime/anomaly.ts](src/runtime/anomaly.ts)

Stable expectations:
1. Runtime analysis produces anomalies with redacted evidence.
2. Report persists to local state and telemetry.

## 9. Cloud Adapter Contract (Optional)

Source of truth:
- [src/cloud/sync.ts](src/cloud/sync.ts)

Stable expectations:
1. Cloud sync is opt-in.
2. Sync payload defaults to summary metrics.
3. Missing cloud configuration returns explicit non-crashing status.

## 10. Compatibility Policy

1. Additive changes to interfaces are minor-version changes.
2. Breaking field removals/renames are major-version changes.
3. Private repositories must pin minimum compatible core version.
4. Contract tests should run in private repos against released core artifacts.

## 11. Contract Test Suite (Required)

Minimum contract tests to keep green:
- CLI help and command routing
- MCP ping/beforeSubmitPrompt/afterFileEdit round-trip
- Scan report shape and blocked logic
- Storage file creation/updates
- Setup doctor/repair health checks
- SARIF output schema validity

Source tests currently validating these patterns:
- [tests/integrations.test.mjs](tests/integrations.test.mjs)
- [tests/policy.test.mjs](tests/policy.test.mjs)
- [tests/rule-scanner.test.mjs](tests/rule-scanner.test.mjs)
- [tests/sarif.test.mjs](tests/sarif.test.mjs)
- [tests/v2-dashboard.test.mjs](tests/v2-dashboard.test.mjs)

## 12. Release Gate for Contract Changes

Before publishing core:
1. Build and tests pass.
2. npm pack --dry-run reviewed.
3. Contract change log updated if any interface changed.
4. Private repos validated against new core version.
