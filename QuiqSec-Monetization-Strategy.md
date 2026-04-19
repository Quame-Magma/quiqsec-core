# QuiqSec Monetization Strategy (Open Core)

## 1. Strategy Goal

QuiqSec should keep its trust-critical security engine open source while monetizing operational scale, managed services, enterprise controls, and compliance workflows.

The monetization model is:
- OSS core for developer trust and adoption
- Paid cloud and enterprise layers for team operations and governance
- Professional services and partner channels for high-touch buyers

## 2. Product Packaging

### 2.1 OSS Core (Free)

Core remains MIT-licensed and fully local-first. This includes:
- MCP prompt interception hooks
- Guardrail prompt builder and intent verification
- Rule engine and custom rules
- Local scanners (source + dependencies)
- Optional external tool adapters (Semgrep/Gitleaks)
- Deploy shield analysis and local auto-remediation
- Snapshot/rollback mechanics
- Local dashboard and collaboration state
- SARIF/JSON reporting and CLI

### 2.2 Pro Cloud (Paid, self-serve)

Target buyers: solo founders and small teams that need less setup and better visibility.

Paid features:
- Hosted dashboard with cross-project portfolio view
- Historical trends longer than local retention windows
- Team/org workspace sync across machines
- Managed alerting (email/Slack/Teams)
- Cloud policy packs and rule updates
- PR annotations and status checks as managed service
- One-click onboarding for supported IDEs and repos

### 2.3 Business / Enterprise (Paid, sales-led)

Target buyers: regulated SMB and mid-market engineering teams.

Paid features:
- SSO/SAML/OIDC and SCIM provisioning
- Role-based policy controls and approval workflows
- Audit logs, immutable event history, policy attestation
- Compliance bundles (SOC2, ISO27001 mapping exports)
- Fine-grained data residency controls
- Private rule registries and signed policy bundles
- SLA, support tiers, and dedicated success engineering

## 3. Pricing Framework

### 3.1 Free OSS
- Unlimited local scans
- Unlimited local rules
- No hosted services

### 3.2 Pro Cloud (usage + seats)
- Per active developer seat
- Usage bands for scan events and retention depth
- Add-ons for premium integrations (advanced CI analytics, custom alerts)

### 3.3 Enterprise
- Annual contract
- Platform fee + seat commitments
- Premium support and compliance modules

## 4. Feature Gating Principles

1. Never gate core security correctness behind paywalls.
2. Monetize convenience, collaboration, governance, and scale.
3. Keep local-first privacy path available in OSS.
4. Ensure paid features degrade gracefully to local mode.
5. Keep API contracts stable between OSS and cloud layers.

## 5. Monetizable Feature Backlog (Phased)

## Phase A (0-3 months)
- Hosted dashboard MVP
- Multi-device project sync
- Managed notifications
- Team-level policy presets

## Phase B (3-6 months)
- GitHub/GitLab native PR review bot service
- Org-level policy governance
- Rule marketplace and curated packs
- Usage analytics and risk trend forecasts

## Phase C (6-12 months)
- SSO + SCIM
- Compliance reporting bundles
- Advanced runtime anomaly intelligence
- Enterprise deployment models

## 6. Go-To-Market Motion

### 6.1 Bottom-up OSS adoption
- Keep install friction low
- Publish transparent roadmap and community changelog
- Encourage custom rules and integration contributions

### 6.2 Product-led conversion
- In-product prompts from local dashboard for optional cloud upgrades
- Triggered upgrade moments:
  - Need shared dashboards
  - Need retention beyond local
  - Need centralized alerts
  - Need org policy controls

### 6.3 Sales-assisted enterprise expansion
- Land with engineering/security teams already using OSS core
- Expand with compliance and identity requirements

## 7. OSS Governance and Trust

- Public security disclosure policy
- Public policy/rule changelog
- Versioned extension APIs for integrations
- Clear boundary between OSS repository and managed-cloud repos
- Avoid source-available bait-and-switch for core scanner logic

## 8. Telemetry and Data Ethics

Default mode remains local-first and opt-in for cloud sync.

Cloud monetization requires:
- Explicit consent and transparent data categories
- Minimal payload defaults (summary metrics, not raw source)
- Configurable redaction and retention controls
- Customer-visible auditability for uploaded events

## 9. Commercial KPIs

Track by funnel stage:

### OSS Adoption
- Weekly active local installs
- MCP interception activation rate
- Time-to-first-successful-scan

### Conversion
- Free-to-paid conversion rate
- Expansion from solo to team plans
- Feature-triggered upgrades (alerts, hosted dashboard, PR automation)

### Retention
- Monthly active workspaces
- Scan frequency per seat
- Policy adherence trend (block rate decay over time)

## 10. Positioning Statement

QuiqSec should be positioned as:
- Open and trustworthy at the security engine layer
- Automated and invisible in day-to-day developer workflows
- Monetized where teams need shared operations, governance, and compliance

This keeps developer trust high while creating durable recurring revenue on top of operational value.
