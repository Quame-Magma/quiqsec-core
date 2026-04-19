# QuiqSec Repository Split Ownership Matrix

## Purpose

This document defines what should live in the public OSS core repository versus private commercial repositories.

Recommended repository names:
- Public: quiqsec-core
- Private: quiqsec-cloud, quiqsec-enterprise

## Ownership Rules

1. Keep public anything required for local security correctness.
2. Keep private anything tied to hosted multi-tenant operations, billing, or enterprise governance.
3. Never let core require private services for baseline scanning and guardrails.

## Current File/Folder Mapping

## Public (OSS Core)

Keep these in the public repository:
- [src/cli/index.ts](src/cli/index.ts)
- [src/cli/ui.ts](src/cli/ui.ts)
- [src/server/index.ts](src/server/index.ts)
- [src/server/handlers.ts](src/server/handlers.ts)
- [src/scanner/index.ts](src/scanner/index.ts)
- [src/scanner/ruleScanner.ts](src/scanner/ruleScanner.ts)
- [src/scanner/dependencyScanner.ts](src/scanner/dependencyScanner.ts)
- [src/scanner/externalScanner.ts](src/scanner/externalScanner.ts)
- [src/scanner/fileDiscovery.ts](src/scanner/fileDiscovery.ts)
- [src/scanner/finding.ts](src/scanner/finding.ts)
- [src/prompt/buildGuardrail.ts](src/prompt/buildGuardrail.ts)
- [src/prompt/classifyPrompt.ts](src/prompt/classifyPrompt.ts)
- [src/prompt/policyPacks.ts](src/prompt/policyPacks.ts)
- [src/prompt/verifyIntent.ts](src/prompt/verifyIntent.ts)
- [src/rules/loadRules.ts](src/rules/loadRules.ts)
- [rules/base-rules.json](rules/base-rules.json)
- [src/policy.ts](src/policy.ts)
- [src/runtime/anomaly.ts](src/runtime/anomaly.ts)
- [src/reporters/json.ts](src/reporters/json.ts)
- [src/reporters/sarif.ts](src/reporters/sarif.ts)
- [src/git.ts](src/git.ts)
- [src/storage.ts](src/storage.ts)
- [src/config.ts](src/config.ts)
- [src/integrations/templates.ts](src/integrations/templates.ts)
- [src/integrations/setup.ts](src/integrations/setup.ts)
- [src/integrations/deployShield.ts](src/integrations/deployShield.ts)
- [src/dashboard/server.ts](src/dashboard/server.ts)
- [src/dashboard/view.ts](src/dashboard/view.ts)
- [src/dashboard/data.ts](src/dashboard/data.ts)
- [src/types.ts](src/types.ts)
- [src/index.ts](src/index.ts)
- [tests/dependency-scanner.test.mjs](tests/dependency-scanner.test.mjs)
- [tests/integrations.test.mjs](tests/integrations.test.mjs)
- [tests/policy.test.mjs](tests/policy.test.mjs)
- [tests/pretty-output.test.mjs](tests/pretty-output.test.mjs)
- [tests/prompt-policy.test.mjs](tests/prompt-policy.test.mjs)
- [tests/redteam-fuzz.test.mjs](tests/redteam-fuzz.test.mjs)
- [tests/rule-scanner.test.mjs](tests/rule-scanner.test.mjs)
- [tests/runtime-anomaly.test.mjs](tests/runtime-anomaly.test.mjs)
- [tests/sarif.test.mjs](tests/sarif.test.mjs)
- [tests/v2-dashboard.test.mjs](tests/v2-dashboard.test.mjs)
- [README.md](README.md)
- [LICENSE](LICENSE)
- [CLA.md](CLA.md)

## Public but Marked as Optional Extension Hooks

Keep these in core, but treat as extension points:
- [src/cloud/sync.ts](src/cloud/sync.ts)
- [src/cloud/index.ts](src/cloud/index.ts)

Reason:
- Preserves open-core compatibility and local-first defaults.
- Allows private repos to implement hosted backends without changing CLI contracts.

## Private (Commercial Repositories)

Move these capabilities to private repositories:
- Hosted dashboard backend APIs
- Team/org multi-workspace sync backend
- Identity/auth stack (SSO/SAML/OIDC/SCIM)
- Billing/subscriptions/entitlements
- Managed alerting channels and notification orchestration
- Compliance export generators and policy attestation service
- Enterprise audit log warehousing
- Premium rule feed distribution service
- SaaS control-plane and tenancy isolation

## Boundary Contracts

Public core may emit:
- Scan summaries
- Health scores
- Hook health telemetry
- Redacted security events

Private services may consume those contracts, but must not be required for:
- Prompt interception
- Local scanning
- Blocking policy decisions
- Snapshot/rollback safety

## Governance Checklist for Every New Feature

Before adding a feature, ask:
1. Does local security correctness depend on this feature?
2. Does this feature require user/account tenancy?
3. Does this feature require billing/entitlement checks?
4. Can this feature degrade gracefully when cloud is disabled?

If answers are:
- Q1 yes: keep in public core.
- Q2 or Q3 yes: private repo.
- Q4 no: redesign before merge.
