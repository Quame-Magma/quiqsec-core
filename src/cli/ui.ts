import type {
  DeployShieldReport,
  HealthReport,
  IntentVerificationReport,
  IntegrationReport,
  IssueSummary,
  PromptGuardrailResult,
  RuntimeAnalysisReport,
  ScanReport,
  ScanResult,
  Severity
} from "../types.js";

const severityOrder: Severity[] = ["critical", "high", "medium", "low"];

type ColorName = "red" | "yellow" | "green" | "cyan" | "gray" | "bold";

const colors: Record<ColorName, [number, number]> = {
  red: [31, 39],
  yellow: [33, 39],
  green: [32, 39],
  cyan: [36, 39],
  gray: [90, 39],
  bold: [1, 22]
};

export class Spinner {
  private timer: NodeJS.Timeout | undefined;
  private index = 0;
  private readonly frames = ["|", "/", "-", "\\"];
  private readonly enabled: boolean;

  constructor(private readonly text: string, enabled = process.stdout.isTTY && !process.env.CI) {
    this.enabled = enabled;
  }

  start(): void {
    if (!this.enabled) {
      return;
    }

    process.stdout.write(`${this.frames[this.index]} ${this.text}`);
    this.timer = setInterval(() => {
      this.index = (this.index + 1) % this.frames.length;
      process.stdout.write(`\r${this.frames[this.index]} ${this.text}`);
    }, 80);
  }

  stop(finalText?: string): void {
    if (!this.enabled) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    process.stdout.write(`\r${" ".repeat(this.text.length + 4)}\r`);
    if (finalText) {
      process.stdout.write(`${finalText}\n`);
    }
  }
}

export function renderPrettyScan(report: ScanReport, colorEnabled = useColor()): string {
  const lines: string[] = [];
  const status = report.blocked ? color("BLOCKED", "red", colorEnabled) : color("PASS", "green", colorEnabled);
  const healthColor = report.healthReport.healthScore >= 90 ? "green" : report.healthReport.healthScore >= 70 ? "yellow" : "red";

  lines.push(color("QuiqSec Scan", "bold", colorEnabled));
  lines.push("");
  lines.push(`Status: ${status}`);
  lines.push(`Health: ${color(`${report.healthReport.healthScore}/100`, healthColor, colorEnabled)}`);
  lines.push(`Files scanned: ${report.filesScanned}`);
  lines.push(`Findings: ${renderSummary(report.summary, colorEnabled)}`);

  if (report.findings.length === 0) {
    lines.push("");
    lines.push(color("No findings. Keep shipping carefully.", "green", colorEnabled));
    return `${lines.join("\n")}\n`;
  }

  lines.push("");
  lines.push(color("Findings", "bold", colorEnabled));

  for (const finding of sortFindings(report.findings)) {
    lines.push(renderFinding(finding, colorEnabled));
  }

  lines.push("");
  lines.push(report.blocked
    ? color("Action required before deploy: fix critical findings or reduce high findings to two or fewer.", "red", colorEnabled)
    : color("No deploy-blocking findings under the current policy.", "green", colorEnabled));

  return `${lines.join("\n")}\n`;
}

export function renderPrettyHealth(report: HealthReport, colorEnabled = useColor()): string {
  const healthColor = report.healthScore >= 90 ? "green" : report.healthScore >= 70 ? "yellow" : "red";

  return [
    color("QuiqSec Health", "bold", colorEnabled),
    "",
    `Score: ${color(`${report.healthScore}/100`, healthColor, colorEnabled)}`,
    `Issues: ${renderSummary(report.issues, colorEnabled)}`,
    `Last scan: ${report.lastScan}`,
    ""
  ].join("\n");
}

export function renderPrettyGuardrail(result: PromptGuardrailResult, colorEnabled = useColor()): string {
  const lines = [
    color("QuiqSec Guardrail", "bold", colorEnabled),
    "",
    `Detected: ${result.classification.categories.join(", ")} (${result.classification.confidence} confidence)`,
    "",
    color("Injected Policies", "bold", colorEnabled),
    ...result.injectedPolicies.map((policy) => `- ${policy}`),
    "",
    color("Modified Prompt", "bold", colorEnabled),
    result.modifiedPrompt,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

export function renderPrettyVerification(report: IntentVerificationReport, colorEnabled = useColor()): string {
  const status = report.passed ? color("PASS", "green", colorEnabled) : color("NEEDS WORK", "yellow", colorEnabled);
  const lines: string[] = [
    color("QuiqSec Intent Verification", "bold", colorEnabled),
    "",
    `Status: ${status}`,
    `Detected: ${report.classification.categories.join(", ")} (${report.classification.confidence} confidence)`,
    `Files checked: ${report.filesChecked}`,
    `Security scan: ${report.scanReport.blocked ? color("BLOCKED", "red", colorEnabled) : color("PASS", "green", colorEnabled)}`,
    `Intent controls: ${color(String(report.satisfiedControls.length), "green", colorEnabled)} satisfied, ${color(String(report.missingControls.length), report.missingControls.length > 0 ? "yellow" : "green", colorEnabled)} missing`,
    ""
  ];

  if (report.missingControls.length > 0) {
    lines.push(color("Missing Controls", "bold", colorEnabled));
    for (const finding of report.missingControls) {
      lines.push(`- [${finding.category}] ${finding.description}`);
      lines.push(`    Fix: ${finding.fix}`);
    }
    lines.push("");
  }

  if (report.satisfiedControls.length > 0) {
    lines.push(color("Satisfied Controls", "bold", colorEnabled));
    for (const finding of report.satisfiedControls) {
      const evidence = finding.evidence ? ` at ${color(`${finding.evidence.file}:${finding.evidence.line}`, "cyan", colorEnabled)}` : "";
      lines.push(`- [${finding.category}] ${finding.description}${evidence}`);
    }
    lines.push("");
  }

  if (report.scanReport.findings.length > 0) {
    lines.push(color("Scanner Findings", "bold", colorEnabled));
    for (const finding of sortFindings(report.scanReport.findings)) {
      lines.push(renderFinding(finding, colorEnabled));
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function renderPrettyRuntime(report: RuntimeAnalysisReport, colorEnabled = useColor()): string {
  const status = report.blocked ? color("ATTENTION", "yellow", colorEnabled) : color("CLEAR", "green", colorEnabled);
  const lines: string[] = [
    color("QuiqSec Runtime Shield", "bold", colorEnabled),
    "",
    `Status: ${status}`,
    `Source: ${report.source}`,
    `Lines analyzed: ${report.linesAnalyzed}`,
    `Anomalies: ${report.anomalies.length}`,
    ""
  ];

  if (report.anomalies.length === 0) {
    lines.push(color("No runtime anomalies found.", "green", colorEnabled));
    lines.push("");
    return lines.join("\n");
  }

  for (const anomaly of report.anomalies) {
    const severity = color(anomaly.severity.toUpperCase(), severityColor(anomaly.severity), colorEnabled);
    lines.push(`- [${severity}] ${anomaly.title} (${anomaly.count})`);
    lines.push(`    ${anomaly.description}`);
    lines.push(`    Evidence: ${color(anomaly.evidence, "gray", colorEnabled)}`);
    lines.push(`    Action: ${anomaly.recommendation}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function renderPrettyIntegrations(report: IntegrationReport, colorEnabled = useColor()): string {
  const lines: string[] = [
    color("QuiqSec Integrations", "bold", colorEnabled),
    "",
    `Workspace: ${color(report.cwd, "cyan", colorEnabled)}`,
    `Templates: ${report.templates.length}`,
    ""
  ];

  for (const template of report.templates) {
    lines.push(color(template.title, "bold", colorEnabled));
    lines.push(`  Editor: ${template.editor}`);
    lines.push(`  File: ${template.filePath}`);
    lines.push(`  Note: ${template.note}`);
    lines.push("  MCP config:");
    for (const line of template.content.split(/\r?\n/)) {
      lines.push(`    ${line}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function renderPrettyDeploy(report: DeployShieldReport, colorEnabled = useColor()): string {
  const status = report.blocked ? color("BLOCKED", "red", colorEnabled) : color("PASS", "green", colorEnabled);
  const lines: string[] = [
    color("QuiqSec Deploy Shield", "bold", colorEnabled),
    "",
    `Status: ${status}`,
    `Root: ${color(report.root, "cyan", colorEnabled)}`,
    `Files scanned: ${report.filesScanned}`,
    `Findings: ${renderSummary(report.summary, colorEnabled)}`,
    ""
  ];

  if (report.targets.length > 0) {
    lines.push(color("Targets", "bold", colorEnabled));
    for (const target of report.targets) {
      const mark = target.exists ? color("found", "green", colorEnabled) : color("missing", "gray", colorEnabled);
      lines.push(`- ${target.file} [${target.platform}/${target.kind}] ${mark}`);
    }
    lines.push("");
  }

  if (report.issues.length > 0) {
    lines.push(color("Findings", "bold", colorEnabled));
    for (const issue of report.issues) {
      const severity = color(issue.severity.toUpperCase(), severityColor(issue.severity), colorEnabled);
      const location = issue.line ? `:${issue.line}` : "";
      lines.push(`- [${severity}] ${issue.platform} ${issue.category} at ${issue.file}${location}`);
      lines.push(`    ${issue.title}`);
      lines.push(`    ${issue.description}`);
      if (issue.evidence) {
        lines.push(`    Evidence: ${color(issue.evidence, "gray", colorEnabled)}`);
      }
      lines.push(`    Fix: ${issue.recommendation}`);
    }
    lines.push("");
  } else {
    lines.push(color("No deploy-shield findings detected.", "green", colorEnabled));
    lines.push("");
  }

  lines.push(report.blocked
    ? color("Deploy blocked: address critical findings or reduce high findings below the threshold.", "red", colorEnabled)
    : color("Deploy shield is clear under the current policy.", "green", colorEnabled));

  return `${lines.join("\n")}\n`;
}

function renderFinding(finding: ScanResult, colorEnabled: boolean): string {
  const severity = color(finding.severity.toUpperCase(), severityColor(finding.severity), colorEnabled);
  const location = color(`${finding.file}:${finding.line}:${finding.column}`, "cyan", colorEnabled);
  const evidence = finding.evidence ? `\n    Evidence: ${color(finding.evidence, "gray", colorEnabled)}` : "";

  return [
    `- [${severity}] ${finding.ruleId} at ${location}`,
    `    ${finding.message}`,
    `    Fix: ${finding.fix.content}${evidence}`
  ].join("\n");
}

function renderSummary(summary: IssueSummary, colorEnabled: boolean): string {
  return [
    `${color(String(summary.critical), "red", colorEnabled)} critical`,
    `${color(String(summary.high), "yellow", colorEnabled)} high`,
    `${color(String(summary.medium), "cyan", colorEnabled)} medium`,
    `${color(String(summary.low), "gray", colorEnabled)} low`
  ].join(", ");
}

function sortFindings(findings: ScanResult[]): ScanResult[] {
  return [...findings].sort((left, right) => {
    const severityDelta = severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return `${left.file}:${left.line}:${left.ruleId}`.localeCompare(`${right.file}:${right.line}:${right.ruleId}`);
  });
}

function severityColor(severity: Severity): ColorName {
  if (severity === "critical") {
    return "red";
  }

  if (severity === "high") {
    return "yellow";
  }

  if (severity === "medium") {
    return "cyan";
  }

  return "gray";
}

function color(value: string, name: ColorName, enabled: boolean): string {
  if (!enabled) {
    return value;
  }

  const [open, close] = colors[name];
  return `\u001b[${open}m${value}\u001b[${close}m`;
}

function useColor(): boolean {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}
