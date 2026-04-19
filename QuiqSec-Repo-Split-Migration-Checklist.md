# QuiqSec Repo Split Migration Checklist

## Objective

Split into open-core and private commercial repositories without breaking npm consumers or local workflows.

## Phase 0: Freeze and Prepare

1. Create a short architecture freeze branch.
2. Tag current state as baseline:
- v0.1.0-pre-split
3. Confirm all tests pass in baseline branch.
4. Confirm publish artifact with:
- npm pack --dry-run

Deliverable:
- A known-good baseline to diff against during split.

## Phase 1: Define Public Contracts

1. Freeze CLI command surface in [src/cli/index.ts](src/cli/index.ts).
2. Freeze core data shapes in [src/types.ts](src/types.ts).
3. Freeze MCP message envelope + handler semantics in [src/server/handlers.ts](src/server/handlers.ts).
4. Freeze storage file semantics in [src/config.ts](src/config.ts) and [src/storage.ts](src/storage.ts).

Deliverable:
- Versioned contract set for OSS and private repos.

## Phase 2: Extract Private Concerns Behind Adapters

1. Keep [src/cloud/sync.ts](src/cloud/sync.ts) as adapter layer only.
2. Replace direct hosted assumptions with endpoint-driven contracts.
3. Ensure all cloud commands behave safely when disabled or missing configuration.
4. Ensure no core code path requires a private token to run local scans.

Deliverable:
- Cloud integration remains optional and cleanly detachable.

## Phase 3: Create New Repositories

1. Create public repo: quiqsec-core.
2. Create private repo: quiqsec-cloud.
3. Optional third repo: quiqsec-enterprise for regulated features.

Deliverable:
- Repos initialized with matching CI scaffolds and branch protections.

## Phase 4: Move Files

1. Move OSS files into quiqsec-core according to [QuiqSec-Repo-Split-Ownership-Matrix.md](QuiqSec-Repo-Split-Ownership-Matrix.md).
2. In private repos, implement:
- Hosted APIs
- Identity and billing
- Compliance and governance modules
3. Keep shared API contracts synced from core types.

Deliverable:
- Cleanly separated codebases with no circular dependency.

## Phase 5: Wire Package and Versioning

1. Publish core package from quiqsec-core.
2. Update private repos to depend on published core version.
3. Enforce semver compatibility matrix:
- private repo minimal supported core version
4. Add CI check that private repo fails if core contract drifts unexpectedly.

Deliverable:
- Stable release train across repositories.

## Phase 6: CI/CD Hardening

In core repo:
1. Build + tests + npm pack dry-run on PR.
2. Release workflow for npm publish.
3. Security scans and dependency audit.

In private repo:
1. Build + tests + integration tests against released core.
2. Contract compliance tests.
3. Staging deploy checks.

Deliverable:
- Independent but compatible pipelines.

## Phase 7: Documentation and Community Messaging

1. Update README in core with explicit OSS scope and optional paid add-ons.
2. Publish feature matrix:
- Core (OSS)
- Pro (Cloud)
- Enterprise
3. Publish migration notes for existing users.

Deliverable:
- Clear user expectations and reduced support friction.

## Phase 8: Release Cutover

1. Release core package from new public repo.
2. Verify install and local execution:
- npm i -g
- quiqsec --help
- quiqsec scan .
3. Smoke-test interception setup:
- quiqsec setup --ide=auto --repair
- quiqsec integrations doctor --ide=auto

Deliverable:
- Successful first post-split release with zero local regression.

## Rollback Plan

If split release has critical issues:
1. Repoint npm dist-tag to previous stable version.
2. Keep private service compatibility pinned to last known good core.
3. Re-open split branch and patch contracts before retry.

## Definition of Done

Split is complete when:
1. Core package works fully local-first with no private dependency.
2. Private repos consume core through stable contracts only.
3. CLI/MCP/scanning behavior remains unchanged for OSS users.
4. Documentation clearly communicates open-core boundaries.
