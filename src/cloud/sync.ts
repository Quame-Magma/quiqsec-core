import { loadConfig, saveConfig } from "../config.js";
import { readLastReport } from "../storage.js";
import type { CloudSyncPayload, CloudSyncResult, QuiqSecConfig } from "../types.js";

export async function syncLatestReportToCloud(cwd = process.cwd()): Promise<CloudSyncResult> {
  const config = await loadConfig(cwd);
  const report = await readLastReport(cwd);

  if (!config.cloud.enabled) {
    return {
      attempted: false,
      synced: false,
      message: "Cloud sync is disabled in .quiqsec/config.json"
    };
  }

  if (!config.cloud.endpoint) {
    return {
      attempted: false,
      synced: false,
      message: "Cloud endpoint is not configured"
    };
  }

  if (!report) {
    return {
      attempted: false,
      synced: false,
      message: "No local scan report found to sync"
    };
  }

  const payload: CloudSyncPayload = {
    projectId: config.cloud.projectId || "local-project",
    generatedAt: report.generatedAt,
    summary: report.summary,
    healthScore: report.healthReport.healthScore,
    filesScanned: report.filesScanned
  };

  const response = await fetch(config.cloud.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...buildAuthHeader(config)
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return {
      attempted: true,
      synced: false,
      status: response.status,
      message: `Cloud sync failed: ${response.status}`
    };
  }

  return {
    attempted: true,
    synced: true,
    status: response.status,
    message: "Cloud sync completed"
  };
}

export async function setCloudToken(token: string, cwd = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  config.cloud.token = token;
  config.cloud.authMode = "token";
  await saveConfig(config, cwd);
}

export async function setCloudEnabled(enabled: boolean, cwd = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  config.cloud.enabled = enabled;
  await saveConfig(config, cwd);
}

export async function setCloudEndpoint(endpoint: string, cwd = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  config.cloud.endpoint = endpoint;
  await saveConfig(config, cwd);
}

export async function exchangeDeviceCode(deviceCode: string, cwd = process.cwd()): Promise<CloudSyncResult> {
  const config = await loadConfig(cwd);

  if (!config.cloud.endpoint) {
    return {
      attempted: false,
      synced: false,
      message: "Cloud endpoint is not configured"
    };
  }

  const tokenUrl = `${config.cloud.endpoint.replace(/\/+$/, "")}/oauth/device/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ deviceCode })
  });

  if (!response.ok) {
    return {
      attempted: true,
      synced: false,
      status: response.status,
      message: `Device token exchange failed: ${response.status}`
    };
  }

  const data = await response.json() as { accessToken?: string };
  if (!data.accessToken) {
    return {
      attempted: true,
      synced: false,
      message: "Device token exchange did not return accessToken"
    };
  }

  config.cloud.token = data.accessToken;
  config.cloud.authMode = "oauth_device";
  config.cloud.enabled = true;
  await saveConfig(config, cwd);

  return {
    attempted: true,
    synced: true,
    status: response.status,
    message: "Cloud OAuth device login completed"
  };
}

function buildAuthHeader(config: QuiqSecConfig): Record<string, string> {
  if (!config.cloud.token) {
    return {};
  }

  return {
    authorization: `Bearer ${config.cloud.token}`
  };
}
