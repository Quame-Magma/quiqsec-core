import type { IntegrationReport, MCPConfigTemplate } from "../types.js";

const QUIQSEC_SERVER_COMMAND = "node";
const QUIQSEC_SERVER_ARGS = ["dist/server/index.js"];

export function buildIntegrationReport(cwd = process.cwd()): IntegrationReport {
  return {
    generatedAt: new Date().toISOString(),
    cwd,
    templates: buildMcpTemplates()
  };
}

export function buildMcpTemplates(): MCPConfigTemplate[] {
  const baseTemplate = JSON.stringify({
    mcpServers: {
      quiqsec: {
        command: QUIQSEC_SERVER_COMMAND,
        args: QUIQSEC_SERVER_ARGS
      }
    }
  }, null, 2);

  return [
    {
      id: "cursor",
      title: "Cursor MCP config",
      editor: "Cursor",
      filePath: ".cursor/mcp.json",
      content: baseTemplate,
      note: "Register the local QuiqSec MCP server for Cursor workspace use."
    },
    {
      id: "claude_code",
      title: "Claude Code MCP config",
      editor: "Claude Code",
      filePath: ".claude/mcp.json",
      content: baseTemplate,
      note: "Point Claude Code at the local QuiqSec server from the repo root."
    },
    {
      id: "vscode",
      title: "VS Code MCP config",
      editor: "VS Code",
      filePath: ".vscode/mcp.json",
      content: baseTemplate,
      note: "Use this with MCP-aware VS Code setups and workspace-level tooling."
    },
    {
      id: "continue",
      title: "Continue MCP config",
      editor: "Continue",
      filePath: ".continue/config.json",
      content: baseTemplate,
      note: "Add QuiqSec as a local MCP server for Continue."
    },
    {
      id: "windsurf",
      title: "Windsurf MCP config",
      editor: "Windsurf",
      filePath: ".windsurf/mcp.json",
      content: baseTemplate,
      note: "Register QuiqSec for Windsurf MCP workflows."
    }
  ];
}
