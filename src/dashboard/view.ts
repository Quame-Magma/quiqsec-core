export const dashboardHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QuiqSec Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --page: #f4f6f8;
        --panel: #ffffff;
        --ink: #111315;
        --muted: #5d6670;
        --line: #dce2e8;
        --green: #11865b;
        --red: #c92f3c;
        --yellow: #a87905;
        --cyan: #087d8f;
        --black: #090a0b;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--page);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 16px;
        letter-spacing: 0;
      }

      button,
      input,
      select {
        font: inherit;
        letter-spacing: 0;
      }

      .shell {
        width: min(1440px, 100%);
        margin: 0 auto;
        padding: 24px;
      }

      .topbar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 16px;
        align-items: center;
        margin-bottom: 20px;
      }

      .brand {
        display: flex;
        gap: 14px;
        align-items: center;
        min-width: 0;
      }

      .mark {
        width: 42px;
        height: 42px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: var(--black);
        color: #ffffff;
        font-weight: 800;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        font-size: 1.45rem;
        line-height: 1.2;
      }

      .path {
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.92rem;
        overflow-wrap: anywhere;
      }

      .actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .button {
        border: 1px solid var(--black);
        background: var(--black);
        color: #ffffff;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
        min-height: 42px;
      }

      .button.secondary {
        background: #ffffff;
        color: var(--black);
        border-color: var(--line);
      }

      .layout {
        display: grid;
        grid-template-columns: 1.1fr 1.8fr 1fr;
        gap: 16px;
        align-items: start;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }

      .panel.pad {
        padding: 18px;
      }

      .panel-title {
        font-size: 0.82rem;
        text-transform: uppercase;
        color: var(--muted);
        font-weight: 750;
        margin-bottom: 12px;
      }

      .score {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 18px;
        align-items: center;
      }

      .dial {
        width: 112px;
        aspect-ratio: 1;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: conic-gradient(var(--score-color) calc(var(--score) * 1%), #e8edf2 0);
        position: relative;
      }

      .dial::after {
        content: "";
        position: absolute;
        inset: 11px;
        border-radius: 50%;
        background: #ffffff;
      }

      .dial span {
        position: relative;
        z-index: 1;
        font-size: 1.55rem;
        font-weight: 850;
      }

      .status {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border-radius: 8px;
        padding: 4px 10px;
        font-weight: 800;
        font-size: 0.82rem;
      }

      .status.pass {
        background: #dff4ea;
        color: var(--green);
      }

      .status.blocked {
        background: #fae1e4;
        color: var(--red);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 16px;
      }

      .metric {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        min-height: 78px;
      }

      .metric strong {
        display: block;
        font-size: 1.35rem;
      }

      .metric span {
        color: var(--muted);
        font-size: 0.86rem;
      }

      .critical strong { color: var(--red); }
      .high strong { color: var(--yellow); }
      .medium strong { color: var(--cyan); }
      .low strong { color: var(--muted); }

      .trend {
        display: flex;
        align-items: end;
        gap: 6px;
        height: 88px;
        margin-top: 10px;
      }

      .bar {
        flex: 1;
        min-width: 8px;
        background: var(--green);
        border-radius: 6px 6px 0 0;
      }

      .findings {
        width: 100%;
        border-collapse: collapse;
      }

      .findings th,
      .findings td {
        padding: 13px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }

      .findings th {
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
      }

      .severity {
        font-weight: 850;
        font-size: 0.78rem;
      }

      .severity.critical { color: var(--red); }
      .severity.high { color: var(--yellow); }
      .severity.medium { color: var(--cyan); }
      .severity.low { color: var(--muted); }

      .empty {
        padding: 28px;
        color: var(--muted);
      }

      .finding-title {
        display: block;
        font-weight: 800;
        margin-bottom: 4px;
      }

      .finding-meta {
        color: var(--muted);
        font-size: 0.86rem;
        overflow-wrap: anywhere;
      }

      .finding-actions {
        display: grid;
        gap: 10px;
      }

      .action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tiny-button {
        border: 1px solid var(--line);
        background: #ffffff;
        color: var(--black);
        border-radius: 8px;
        min-height: 34px;
        padding: 6px 10px;
        cursor: pointer;
      }

      .tiny-button.active {
        border-color: var(--black);
        background: #eef2f5;
        font-weight: 750;
      }

      .prompt-box {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px 12px;
        background: #f8fafb;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        color: var(--ink);
        font-size: 0.88rem;
      }

      .feedback-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        color: var(--muted);
        font-size: 0.84rem;
      }

      .comment-thread {
        display: grid;
        gap: 8px;
      }

      .comment-item {
        border-left: 2px solid var(--line);
        padding-left: 10px;
        color: var(--muted);
        font-size: 0.84rem;
      }

      .comment-form {
        display: grid;
        gap: 8px;
      }

      .comment-input {
        width: 100%;
        min-height: 68px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px 12px;
        resize: vertical;
        font: inherit;
      }

      .ops-image {
        width: 100%;
        height: 168px;
        object-fit: cover;
        display: block;
      }

      .runtime-list,
      .team-list,
      .event-list {
        display: grid;
        gap: 10px;
      }

      .line-item {
        border-top: 1px solid var(--line);
        padding-top: 12px;
      }

      .line-item:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .line-item strong {
        display: block;
        margin-bottom: 4px;
      }

      .line-item span,
      .fine {
        color: var(--muted);
        font-size: 0.88rem;
      }

      .stack {
        display: grid;
        gap: 16px;
      }

      @media (max-width: 1100px) {
        .layout {
          grid-template-columns: 1fr 1fr;
        }

        .right {
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 720px) {
        .shell {
          padding: 16px;
        }

        .topbar {
          grid-template-columns: 1fr;
        }

        .actions {
          width: 100%;
        }

        .button {
          flex: 1;
        }

        .layout {
          grid-template-columns: 1fr;
        }

        .score {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="topbar">
        <div class="brand">
          <div class="mark">QS</div>
          <div>
            <h1 id="projectName">QuiqSec</h1>
            <p class="path" id="projectPath">Loading project state</p>
          </div>
        </div>
        <div class="actions">
          <button class="button secondary" id="refreshButton">Refresh</button>
          <button class="button" id="scanButton">Run Scan</button>
        </div>
      </section>

      <section class="layout">
        <aside class="stack">
          <section class="panel pad">
            <p class="panel-title">Security Posture</p>
            <div class="score">
              <div class="dial" id="scoreDial" style="--score: 0; --score-color: var(--green);"><span id="scoreValue">--</span></div>
              <div>
                <span class="status pass" id="statusBadge">Loading</span>
                <p class="fine" id="lastScan">No scan yet</p>
              </div>
            </div>
            <div class="summary-grid" id="summaryGrid"></div>
          </section>

          <section class="panel pad">
            <p class="panel-title">Health Trend</p>
            <div class="trend" id="trend"></div>
            <p class="fine" id="trendText">Scan history appears here after repeated scans.</p>
          </section>
        </aside>

        <section class="panel">
          <div class="pad">
            <p class="panel-title">Findings</p>
            <p class="fine" id="findingIntro">Current scan findings and deploy blockers.</p>
          </div>
          <table class="findings">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Rule</th>
                <th>Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="findingsBody"></tbody>
          </table>
          <div class="empty" id="emptyFindings">No findings yet.</div>
        </section>

        <aside class="stack right">
          <section class="panel">
            <img class="ops-image" src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=80" alt="Secure infrastructure operations">
            <div class="pad">
              <p class="panel-title">Runtime Shield</p>
              <div class="runtime-list" id="runtimeList"></div>
            </div>
          </section>

          <section class="panel pad">
            <p class="panel-title">Team Workspace</p>
            <div class="team-list" id="teamList"></div>
          </section>

          <section class="panel pad">
            <p class="panel-title">Recent Activity</p>
            <div class="event-list" id="eventList"></div>
          </section>
        </aside>
      </section>
    </main>

    <script>
      const state = {
        dashboard: null,
        prompts: {},
        openComments: new Set()
      };

      const byId = (id) => document.getElementById(id);

      function text(node, value) {
        node.textContent = value;
      }

      async function loadDashboard() {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) throw new Error("Dashboard data unavailable");
        state.dashboard = await response.json();
        render();
      }

      async function runScan() {
        byId("scanButton").disabled = true;
        text(byId("scanButton"), "Scanning");
        try {
          const response = await fetch("/api/scan", { method: "POST" });
          if (!response.ok) throw new Error("Scan failed");
          await loadDashboard();
        } finally {
          byId("scanButton").disabled = false;
          text(byId("scanButton"), "Run Scan");
        }
      }

      function render() {
        const data = state.dashboard;
        const report = data.lastReport;
        const score = report ? report.healthReport.healthScore : 100;
        const blocked = report ? report.blocked : false;
        const summary = report ? report.summary : { critical: 0, high: 0, medium: 0, low: 0 };

        text(byId("projectName"), data.workspace.projectName);
        text(byId("projectPath"), report ? report.root : "Local workspace");
        text(byId("scoreValue"), String(score));
        byId("scoreDial").style.setProperty("--score", String(score));
        byId("scoreDial").style.setProperty("--score-color", score >= 90 ? "var(--green)" : score >= 70 ? "var(--yellow)" : "var(--red)");
        text(byId("statusBadge"), blocked ? "BLOCKED" : "PASS");
        byId("statusBadge").className = "status " + (blocked ? "blocked" : "pass");
        text(byId("lastScan"), report ? "Last scan " + new Date(report.generatedAt).toLocaleString() : "No scan yet");

        renderSummary(summary);
        renderTrend(data.history);
        renderFindings(report ? report.findings : [], data.collaboration);
        renderRuntime(data.runtime);
        renderTeam(data.workspace.members, data.workspace.integrations, data.mcpHealth);
        renderEvents(data.telemetry);
      }

      function renderSummary(summary) {
        const grid = byId("summaryGrid");
        grid.replaceChildren();
        for (const key of ["critical", "high", "medium", "low"]) {
          const item = document.createElement("div");
          item.className = "metric " + key;
          const value = document.createElement("strong");
          text(value, String(summary[key] || 0));
          const label = document.createElement("span");
          text(label, key);
          item.append(value, label);
          grid.append(item);
        }
      }

      function renderTrend(history) {
        const trend = byId("trend");
        trend.replaceChildren();
        const recent = history.slice(-12);
        if (recent.length === 0) {
          text(byId("trendText"), "Run scans to build a local history.");
          return;
        }
        for (const entry of recent) {
          const bar = document.createElement("div");
          bar.className = "bar";
          bar.style.height = Math.max(8, entry.healthScore) + "%";
          bar.style.background = entry.healthScore >= 90 ? "var(--green)" : entry.healthScore >= 70 ? "var(--yellow)" : "var(--red)";
          bar.title = entry.healthScore + "/100 at " + entry.generatedAt;
          trend.append(bar);
        }
        text(byId("trendText"), recent.length + " recent scan" + (recent.length === 1 ? "" : "s"));
      }

      function renderFindings(findings, collaboration) {
        const collab = collaboration || { comments: [], feedback: [], actions: [] };
        const body = byId("findingsBody");
        const empty = byId("emptyFindings");
        body.replaceChildren();
        empty.style.display = findings.length === 0 ? "block" : "none";
        for (const finding of findings.slice(0, 20)) {
          const row = document.createElement("tr");
          row.append(
            cell(finding.severity.toUpperCase(), "severity " + finding.severity),
            cell(finding.ruleId),
            cell(finding.file + ":" + finding.line)
          );
          row.append(findingActionCell(finding, collab));
          body.append(row);
        }
      }

      function findingActionCell(finding, collaboration) {
        const td = document.createElement("td");
        const wrapper = document.createElement("div");
        wrapper.className = "finding-actions";

        const title = document.createElement("strong");
        title.className = "finding-title";
        text(title, finding.message);

        const meta = document.createElement("div");
        meta.className = "finding-meta";
        text(meta, finding.fix.content);

        const actionRow = document.createElement("div");
        actionRow.className = "action-row";

        actionRow.append(
          tinyButton("Fix Prompt", () => generateFixPrompt(finding)),
          tinyButton("Copy Prompt", () => copyFixPrompt(finding)),
          tinyButton("Helpful", () => submitFeedback(finding, "up")),
          tinyButton("Needs Work", () => submitFeedback(finding, "down")),
          tinyButton(state.openComments.has(finding.id) ? "Hide Comment" : "Comment", () => toggleCommentBox(finding.id))
        );

        const promptBox = document.createElement("div");
        promptBox.className = "prompt-box";
        promptBox.hidden = !state.prompts[finding.id];
        text(promptBox, state.prompts[finding.id] || "");

        const feedbackRow = document.createElement("div");
        feedbackRow.className = "feedback-row";
        const feedback = summarizeFeedback(collaboration.feedback, finding.id);
        text(
          feedbackRow,
          "Helpful: " +
            feedback.up +
            "  Needs work: " +
            feedback.down +
            "  Comments: " +
            commentsForFinding(collaboration.comments, finding.id).length
        );

        const commentThread = document.createElement("div");
        commentThread.className = "comment-thread";
        const comments = commentsForFinding(collaboration.comments, finding.id).slice(-3);
        if (comments.length === 0) {
          commentThread.append(lineItem("No comments yet", "Use Comment to add local feedback."));
        } else {
          for (const comment of comments) {
            commentThread.append(commentItem(comment.author, comment.text));
          }
        }

        const commentForm = document.createElement("div");
        commentForm.className = "comment-form";
        commentForm.hidden = !state.openComments.has(finding.id);

        const textarea = document.createElement("textarea");
        textarea.className = "comment-input";
        textarea.placeholder = "Add a local comment";

        const submit = document.createElement("button");
        submit.className = "tiny-button";
        text(submit, "Post Comment");
        submit.addEventListener("click", async () => {
          const value = textarea.value.trim();
          if (!value) return;
          submit.disabled = true;
          try {
            await postJson("/api/findings/" + encodeURIComponent(finding.id) + "/comments", { text: value, author: "Local Owner" });
            state.openComments.delete(finding.id);
            await loadDashboard();
          } finally {
            submit.disabled = false;
          }
        });

        commentForm.append(textarea, submit);

        wrapper.append(title, meta, actionRow, promptBox, feedbackRow, commentThread, commentForm);
        td.append(wrapper);
        return td;
      }

      async function generateFixPrompt(finding) {
        const response = await postJson("/api/findings/" + encodeURIComponent(finding.id) + "/fix-prompt", {});
        state.prompts[finding.id] = response.prompt;
        renderFindings(currentFindings(), currentCollaboration());
      }

      async function copyFixPrompt(finding) {
        const response = await postJson("/api/findings/" + encodeURIComponent(finding.id) + "/fix-prompt/copy", {});
        const prompt = response.prompt;
        state.prompts[finding.id] = prompt;
        renderFindings(currentFindings(), currentCollaboration());

        if (navigator.clipboard && prompt) {
          await navigator.clipboard.writeText(prompt);
        }
      }

      async function submitFeedback(finding, vote) {
        await postJson("/api/findings/" + encodeURIComponent(finding.id) + "/feedback", { vote });
        await loadDashboard();
      }

      function toggleCommentBox(findingId) {
        if (state.openComments.has(findingId)) {
          state.openComments.delete(findingId);
        } else {
          state.openComments.add(findingId);
        }
        renderFindings(currentFindings(), currentCollaboration());
      }

      function summarizeFeedback(feedback, findingId) {
        return feedback.reduce(
          (counts, item) => {
            if (item.findingId === findingId) {
              counts[item.vote] += 1;
            }
            return counts;
          },
          { up: 0, down: 0 }
        );
      }

      function commentsForFinding(comments, findingId) {
        return comments.filter((comment) => comment.findingId === findingId);
      }

      function currentFindings() {
        return state.dashboard && state.dashboard.lastReport ? state.dashboard.lastReport.findings : [];
      }

      function currentCollaboration() {
        return state.dashboard ? state.dashboard.collaboration : { comments: [], feedback: [], actions: [] };
      }

      function commentItem(author, textValue) {
        const item = document.createElement("div");
        item.className = "comment-item";
        const label = document.createElement("strong");
        const body = document.createElement("span");
        text(label, author);
        text(body, textValue);
        item.append(label, document.createElement("br"), body);
        return item;
      }

      async function postJson(path, body) {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error("Request failed");
        }

        return response.json();
      }

      function renderRuntime(runtime) {
        const list = byId("runtimeList");
        list.replaceChildren();
        if (!runtime || runtime.anomalies.length === 0) {
          list.append(lineItem("No runtime anomalies", "Analyze logs with quiqsec runtime --logs path"));
          return;
        }
        for (const anomaly of runtime.anomalies.slice(0, 4)) {
          list.append(lineItem(anomaly.title, anomaly.recommendation));
        }
      }

      function renderTeam(members, integrations, mcpHealth) {
        const list = byId("teamList");
        list.replaceChildren();
        if (mcpHealth) {
          const diagnostics = Array.isArray(mcpHealth.diagnostics) && mcpHealth.diagnostics.length > 0
            ? mcpHealth.diagnostics.join(" | ")
            : "Prompt interception is active.";
          list.append(lineItem("MCP Hook: " + String(mcpHealth.status).toUpperCase(), diagnostics));
        }
        for (const member of members) {
          list.append(lineItem(member.name, member.role));
        }
        for (const integration of integrations) {
          list.append(lineItem(integration.name + " - " + integration.status.replace("_", " "), integration.detail));
        }
      }

      function renderEvents(events) {
        const list = byId("eventList");
        list.replaceChildren();
        const recent = events.slice(-6).reverse();
        if (recent.length === 0) {
          list.append(lineItem("No activity yet", "Run a scan to start local telemetry."));
          return;
        }
        for (const event of recent) {
          list.append(lineItem(event.type, new Date(event.createdAt).toLocaleString()));
        }
      }

      function cell(value, className) {
        const td = document.createElement("td");
        if (className) td.className = className;
        text(td, value);
        return td;
      }

      function tinyButton(label, handler) {
        const button = document.createElement("button");
        button.className = "tiny-button";
        text(button, label);
        button.addEventListener("click", handler);
        return button;
      }

      function lineItem(title, detail) {
        const item = document.createElement("div");
        item.className = "line-item";
        const strong = document.createElement("strong");
        const span = document.createElement("span");
        text(strong, title);
        text(span, detail);
        item.append(strong, span);
        return item;
      }

      byId("refreshButton").addEventListener("click", loadDashboard);
      byId("scanButton").addEventListener("click", runScan);
      loadDashboard().catch((error) => {
        text(byId("findingIntro"), error.message);
      });
    </script>
  </body>
</html>`;
