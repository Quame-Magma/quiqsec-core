export type Severity = "low" | "medium" | "high" | "critical";

export type FixType = "code_patch" | "prompt";

export interface MCPMessage<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
}

export interface FixSuggestion {
  type: FixType;
  content: string;
}

export interface ScanResult {
  id: string;
  tool: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  ruleId: string;
  fix: FixSuggestion;
  evidence?: string;
}

export interface Rule {
  id: string;
  description: string;
  pattern: string;
  severity: Severity;
  fixTemplate: string;
  tags?: string[];
}

export interface FixPatch {
  file: string;
  startLine: number;
  endLine: number;
  replacement: string;
}

export interface Snapshot {
  id: string;
  tag: string;
  branch?: string;
  commit: string;
  createdAt: string;
}

export interface IssueSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface HealthReport {
  healthScore: number;
  issues: IssueSummary;
  lastScan: string;
}

export interface QuiqSecConfig {
  version: number;
  severityPolicy: {
    blockOnCritical: boolean;
    maxHighBeforeBlock: number;
  };
  scan: {
    include: string[];
    exclude: string[];
    external: {
      semgrep: boolean;
      gitleaks: boolean;
      timeoutMs: number;
    };
  };
  rules: {
    paths: string[];
  };
  cloud: {
    enabled: boolean;
    endpoint: string;
    projectId: string;
    authMode: "token" | "oauth_device";
    token: string;
  };
}

export interface WorkspaceMember {
  id: string;
  name: string;
  role: "owner" | "admin" | "developer" | "viewer";
  email?: string;
}

export interface WorkspaceIntegration {
  id: string;
  name: string;
  status: "not_configured" | "connected" | "attention";
  detail: string;
}

export interface WorkspaceState {
  projectName: string;
  createdAt: string;
  updatedAt: string;
  members: WorkspaceMember[];
  integrations: WorkspaceIntegration[];
}

export interface FindingComment {
  id: string;
  findingId: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface FindingFeedback {
  id: string;
  findingId: string;
  vote: "up" | "down";
  note: string;
  createdAt: string;
}

export interface FindingActionEvent {
  id: string;
  findingId: string;
  type: "comment.added" | "feedback.added" | "fix_prompt.generated" | "fix_prompt.copied";
  createdAt: string;
  detail: string;
  data: Record<string, unknown>;
}

export interface CollaborationState {
  comments: FindingComment[];
  feedback: FindingFeedback[];
  actions: FindingActionEvent[];
}

export interface ScanReport {
  generatedAt: string;
  root: string;
  filesScanned: number;
  findings: ScanResult[];
  summary: IssueSummary;
  healthReport: HealthReport;
  blocked: boolean;
}

export interface ScanHistoryEntry {
  id: string;
  generatedAt: string;
  filesScanned: number;
  healthScore: number;
  blocked: boolean;
  summary: IssueSummary;
}

export interface TelemetryEvent {
  id: string;
  type: "scan.completed" | "runtime.anomaly" | "verification.completed";
  createdAt: string;
  data: Record<string, unknown>;
}

export interface ScanOptions {
  cwd?: string;
  writeFindings?: boolean;
  useExternalScanners?: boolean;
  external?: {
    semgrep?: boolean;
    gitleaks?: boolean;
    timeoutMs?: number;
  };
}

export interface RollbackPreview {
  tag: string;
  commit: string;
  changedFiles: string[];
  recoveryPlan: string;
}

export interface PromptClassification {
  categories: string[];
  matchedKeywords: Record<string, string[]>;
  confidence: "low" | "medium" | "high";
}

export interface VerificationControl {
  id: string;
  category: string;
  description: string;
  evidencePatterns: string[];
  fix: string;
}

export interface VerificationFinding {
  controlId: string;
  category: string;
  description: string;
  fix: string;
  evidence?: {
    file: string;
    line: number;
    text: string;
  };
}

export interface PromptGuardrailResult {
  originalPrompt: string;
  modifiedPrompt: string;
  classification: PromptClassification;
  injectedPolicies: string[];
}

export interface IntentVerificationReport {
  prompt: string;
  classification: PromptClassification;
  filesChecked: number;
  satisfiedControls: VerificationFinding[];
  missingControls: VerificationFinding[];
  scanReport: ScanReport;
  passed: boolean;
}

export interface RuntimeAnomaly {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  count: number;
}

export interface RuntimeAnalysisReport {
  generatedAt: string;
  source: string;
  linesAnalyzed: number;
  anomalies: RuntimeAnomaly[];
  blocked: boolean;
}

export interface MCPHealthStatus {
  status: "connected" | "degraded" | "disconnected";
  serverStartedAt: string;
  lastPingAt: string | null;
  lastInterceptAt: string | null;
  lastAfterEditAt: string | null;
  diagnostics: string[];
}

export interface DashboardData {
  workspace: WorkspaceState;
  lastReport: ScanReport | null;
  history: ScanHistoryEntry[];
  runtime: RuntimeAnalysisReport | null;
  telemetry: TelemetryEvent[];
  collaboration: CollaborationState;
  mcpHealth: MCPHealthStatus;
}

export type IntegrationPlatform = "cursor" | "claude_code" | "vscode" | "continue" | "windsurf";

export interface MCPConfigTemplate {
  id: IntegrationPlatform;
  title: string;
  editor: string;
  filePath: string;
  content: string;
  note: string;
}

export interface IntegrationReport {
  generatedAt: string;
  cwd: string;
  templates: MCPConfigTemplate[];
}

export type DeployShieldPlatform = "vercel" | "supabase" | "railway" | "fly" | "unknown";

export type DeployShieldCategory = "security_headers" | "env_placeholder" | "public_secret" | "supabase_rls";

export interface DeployShieldTarget {
  file: string;
  platform: DeployShieldPlatform;
  kind: "config" | "migration";
  exists: boolean;
}

export interface DeployShieldIssue {
  id: string;
  platform: DeployShieldPlatform;
  file: string;
  line?: number;
  severity: Severity;
  category: DeployShieldCategory;
  title: string;
  description: string;
  evidence?: string;
  recommendation: string;
}

export interface DeployShieldReport {
  generatedAt: string;
  root: string;
  filesScanned: number;
  targets: DeployShieldTarget[];
  issues: DeployShieldIssue[];
  summary: IssueSummary;
  blocked: boolean;
  appliedFixes?: string[];
}

export interface ExternalScannerReport {
  findings: ScanResult[];
  toolsUsed: string[];
  errors: string[];
}

export interface CloudSyncPayload {
  projectId: string;
  generatedAt: string;
  summary: IssueSummary;
  healthScore: number;
  filesScanned: number;
}

export interface CloudSyncResult {
  attempted: boolean;
  synced: boolean;
  status?: number;
  message: string;
}
