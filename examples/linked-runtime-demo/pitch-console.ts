export type PitchConsoleView = "dashboard" | "registry" | "runtime" | "incidents" | "decisions";

export type PitchConsoleRun = {
  id: string;
  createdAt: string;
  telemetryEventId: string | null;
  caseReference: string;
  customerName: string;
  agentName: string;
  prompt: string;
  response: string | null;
  modeLabel: string;
  decision: string;
  decisionStage: "input" | "output" | null;
  blocked: boolean;
  releasedToEndUser: boolean;
  modelCallExecuted: boolean;
  thresholdBreaches: string[];
  restrictedPromptMatches: string[];
  reasonCodes: string[];
  escalatedIncidentId: string | null;
  correlationId: string;
  runtimeSummary: string;
  decisionSummary: string | null;
};

type RenderConsoleOptions = {
  view: PitchConsoleView;
  runs: PitchConsoleRun[];
  workspaceUrl: string;
};

const systems = [
  {
    name: "Collections Hardship Assistant",
    owner: "Customer Care AI",
    useCase: "Drafts hardship responses for human review",
    risk: "Medium",
    tier: "Tier 2",
    status: "Active",
    coverage: 92,
  },
  {
    name: "Credit Eligibility Decision Engine",
    owner: "Retail Credit Risk",
    useCase: "Supports consumer credit eligibility decisions",
    risk: "High",
    tier: "Tier 3",
    status: "In review",
    coverage: 84,
  },
  {
    name: "Voice Banking Assistant",
    owner: "Secure Servicing",
    useCase: "Handles authenticated voice-service enquiries",
    risk: "High",
    tier: "Tier 3",
    status: "Active",
    coverage: 81,
  },
  {
    name: "Retail Support Resolution Copilot",
    owner: "Digital Service",
    useCase: "Suggests resolutions for customer support cases",
    risk: "Medium",
    tier: "Tier 2",
    status: "Active",
    coverage: 89,
  },
  {
    name: "Invoice Extraction Copilot",
    owner: "Finance Operations",
    useCase: "Extracts fields from supplier invoices",
    risk: "Minimal",
    tier: "Tier 1",
    status: "Active",
    coverage: 96,
  },
  {
    name: "Candidate Screening Assistant",
    owner: "People Operations",
    useCase: "Summarises objective candidate experience",
    risk: "High",
    tier: "Tier 3",
    status: "Paused",
    coverage: 76,
  },
];

const baselineEvents = [
  {
    time: "09:42:18",
    system: "Collections Hardship Assistant",
    summary: "Customer response checked before release",
    decision: "allow",
    stage: "output",
    correlation: "a31f…9c20",
  },
  {
    time: "09:38:04",
    system: "Voice Banking Assistant",
    summary: "Internal prompt disclosure attempt stopped",
    decision: "block",
    stage: "input",
    correlation: "66b2…4aa1",
  },
  {
    time: "09:31:47",
    system: "Candidate Screening Assistant",
    summary: "Subjective screening language flagged for review",
    decision: "warn",
    stage: "output",
    correlation: "df04…811b",
  },
];

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactId(value: string | null | undefined) {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 5)}…${value.slice(-4)}` : value;
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatRelative(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 10_000) return "just now";
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1000)}s ago`;
  return `${Math.floor(elapsed / 60_000)}m ago`;
}

function decisionTone(decision: string) {
  const normalized = decision.toLowerCase();
  if (normalized === "block") return "danger";
  if (normalized === "warn" || normalized === "escalate") return "warning";
  return "success";
}

function badge(label: string, tone = "neutral") {
  return `<span class="badge ${escapeHtml(tone)}"><i></i>${escapeHtml(label)}</span>`;
}

function renderKpi(label: string, value: string | number, detail: string, tone = "") {
  return `
    <article class="kpi-card ${escapeHtml(tone)}">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-detail">${escapeHtml(detail)}</div>
    </article>`;
}

function renderLiveActivityRows(runs: PitchConsoleRun[], limit = 7) {
  const liveRows = runs.slice(0, limit).map((run) => `
    <tr class="new-row ${decisionTone(run.decision)}">
      <td><div class="primary-cell">${escapeHtml(formatClock(run.createdAt))}</div><div class="secondary-cell">${escapeHtml(formatRelative(run.createdAt))}</div></td>
      <td><div class="primary-cell">Collections Hardship Assistant</div><div class="secondary-cell">${escapeHtml(run.caseReference)} · ${escapeHtml(run.agentName)}</div></td>
      <td><div class="primary-cell clamp">${escapeHtml(run.decisionSummary || run.runtimeSummary)}</div><div class="secondary-cell clamp">${escapeHtml(run.prompt)}</div></td>
      <td>${badge(run.decision.toUpperCase(), decisionTone(run.decision))}</td>
      <td><span class="mono">${escapeHtml(run.decisionStage || "—")}</span></td>
      <td><span class="mono">${escapeHtml(compactId(run.correlationId))}</span></td>
    </tr>`);

  const remaining = Math.max(0, limit - liveRows.length);
  const seededRows = baselineEvents.slice(0, remaining).map((event) => `
    <tr>
      <td><div class="primary-cell">${escapeHtml(event.time)}</div><div class="secondary-cell">seeded</div></td>
      <td><div class="primary-cell">${escapeHtml(event.system)}</div><div class="secondary-cell">Synthetic baseline</div></td>
      <td><div class="primary-cell clamp">${escapeHtml(event.summary)}</div><div class="secondary-cell">Policy evaluation completed</div></td>
      <td>${badge(event.decision.toUpperCase(), decisionTone(event.decision))}</td>
      <td><span class="mono">${escapeHtml(event.stage)}</span></td>
      <td><span class="mono">${escapeHtml(event.correlation)}</span></td>
    </tr>`);

  return [...liveRows, ...seededRows].join("");
}

function renderDashboard(runs: PitchConsoleRun[]) {
  const liveBlocked = runs.filter((run) => run.blocked).length;
  const liveAllowed = runs.filter((run) => !run.blocked && run.decision === "allow").length;
  return `
    <section class="hero-card">
      <div>
        <div class="eyebrow"><span class="live-dot"></span> Northstar Consumer Bank · synthetic pitch environment</div>
        <h1>Governance operations at a glance</h1>
        <p>See what is in scope, what needs attention, and what the runtime policy stopped—without waiting for a quarterly spreadsheet review.</p>
        <div class="hero-actions">
          <a class="button primary" href="/" target="_blank" rel="noreferrer">Open frontline workspace <span>↗</span></a>
          <a class="button secondary" href="/control-grid/runtime">View live runtime feed</a>
        </div>
      </div>
      <div class="hero-signal">
        <div class="signal-label">Pitch scenario status</div>
        <strong>${runs.length ? `${runs.length} governed turn${runs.length === 1 ? "" : "s"} captured` : "Ready for the first governed turn"}</strong>
        <p>${liveBlocked ? `${liveBlocked} unsafe request${liveBlocked === 1 ? " was" : "s were"} stopped before release.` : "Run the green prompt first, then the red prompt from the workspace."}</p>
        <div class="signal-bar"><span style="width:${runs.length ? Math.min(100, 34 + runs.length * 26) : 18}%"></span></div>
      </div>
    </section>

    <section class="kpi-grid">
      ${renderKpi("Systems in scope", 15, "Across 6 operating companies")}
      ${renderKpi("High-scrutiny systems", 4, "Enhanced controls and approval", "amber")}
      ${renderKpi("Control coverage", "87%", "Implemented or verified", "teal")}
      ${renderKpi("Blocked in this session", liveBlocked, liveBlocked ? "Incident evidence created" : "Waiting for the red prompt", liveBlocked ? "red" : "")}
    </section>

    <section class="dashboard-grid">
      <article class="panel demo-path">
        <div class="panel-heading">
          <div><span class="section-kicker">Guided story</span><h2>Four moves. One closed loop.</h2></div>
          ${badge(runs.length ? "IN PROGRESS" : "READY", runs.length ? "warning" : "success")}
        </div>
        <ol class="path-list">
          <li class="done"><span>1</span><div><strong>Show governed inventory</strong><p>Start here, then open the registry to explain proportional risk.</p></div></li>
          <li class="${liveAllowed ? "done" : "active"}"><span>2</span><div><strong>Run a safe customer draft</strong><p>The prompt and output are checked before the response is released.</p></div></li>
          <li class="${liveBlocked ? "done" : liveAllowed ? "active" : ""}"><span>3</span><div><strong>Trigger the blocked PII prompt</strong><p>Policy stops the request before the model executes.</p></div></li>
          <li class="${liveBlocked ? "active" : ""}"><span>4</span><div><strong>Reveal evidence and incident</strong><p>Return to runtime monitoring and incidents to close the loop.</p></div></li>
        </ol>
      </article>

      <article class="panel posture-panel">
        <div class="panel-heading"><div><span class="section-kicker">Portfolio posture</span><h2>Northstar control coverage</h2></div><span class="score-ring">87<small>%</small></span></div>
        <div class="coverage-row"><span>Runtime policy</span><strong>94%</strong><div><i style="width:94%"></i></div></div>
        <div class="coverage-row"><span>Evidence readiness</span><strong>89%</strong><div><i style="width:89%"></i></div></div>
        <div class="coverage-row"><span>Human oversight</span><strong>82%</strong><div><i style="width:82%"></i></div></div>
        <div class="coverage-row"><span>Third-party assurance</span><strong>76%</strong><div><i style="width:76%"></i></div></div>
        <p class="panel-note">Synthetic values demonstrate the operating view; they are not customer performance claims.</p>
      </article>
    </section>

    <section class="panel activity-panel">
      <div class="panel-heading">
        <div><span class="section-kicker">Live evidence stream</span><h2>Latest governance activity</h2></div>
        <div class="refresh-label"><span class="live-dot"></span> Auto-refreshing</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>System</th><th>Policy event</th><th>Decision</th><th>Stage</th><th>Correlation</th></tr></thead><tbody>${renderLiveActivityRows(runs, 6)}</tbody></table></div>
    </section>`;
}

function renderRegistry() {
  return `
    <section class="page-heading">
      <div><div class="eyebrow">Governed inventory</div><h1>AI system registry</h1><p>A canonical view of ownership, purpose, risk, approval tier, and control readiness.</p></div>
      <div class="page-actions">${badge("15 SYSTEMS", "neutral")}<button class="button primary" type="button" disabled>Register system</button></div>
    </section>
    <section class="kpi-grid compact">
      ${renderKpi("Active", 11, "Production and pilot")}
      ${renderKpi("High risk", 4, "Enhanced scrutiny", "amber")}
      ${renderKpi("In review", 2, "Approval workflow open")}
      ${renderKpi("Average coverage", "87%", "Across mapped controls", "teal")}
    </section>
    <section class="panel">
      <div class="toolbar"><div class="search-shell">⌕ <span>Search systems, owners, or use cases</span></div><div class="filter-chip">All risk levels</div><div class="filter-chip">All statuses</div></div>
      <div class="table-wrap"><table class="registry-table"><thead><tr><th>System</th><th>Owner</th><th>Risk</th><th>Approval</th><th>Status</th><th>Coverage</th></tr></thead><tbody>
        ${systems.map((system) => `<tr>
          <td><div class="primary-cell">${escapeHtml(system.name)}</div><div class="secondary-cell clamp">${escapeHtml(system.useCase)}</div></td>
          <td>${escapeHtml(system.owner)}</td>
          <td>${badge(system.risk.toUpperCase(), system.risk === "High" ? "danger" : system.risk === "Medium" ? "warning" : "success")}</td>
          <td><span class="tier-pill">${escapeHtml(system.tier)}</span></td>
          <td><span class="status-text ${system.status.toLowerCase().replace(" ", "-")}"><i></i>${escapeHtml(system.status)}</span></td>
          <td><div class="coverage-cell"><strong>${system.coverage}%</strong><span><i style="width:${system.coverage}%"></i></span></div></td>
        </tr>`).join("")}
      </tbody></table></div>
      <div class="table-footer"><span>Showing 6 featured systems of 15 synthetic records</span><span>Northstar Consumer Bank Demo</span></div>
    </section>`;
}

function renderRuntime(runs: PitchConsoleRun[]) {
  const blocked = runs.filter((run) => run.blocked).length;
  const allowed = runs.filter((run) => !run.blocked && run.decision === "allow").length;
  const warned = runs.filter((run) => run.decision === "warn" || run.decision === "escalate").length;
  return `
    <section class="page-heading">
      <div><div class="eyebrow"><span class="live-dot"></span> Runtime enforcement</div><h1>Live policy decisions</h1><p>Prompts are checked before model execution; outputs are checked again before release.</p></div>
      <a class="button primary" href="/" target="_blank" rel="noreferrer">Run a governed turn ↗</a>
    </section>
    <section class="kpi-grid compact">
      ${renderKpi("Session events", runs.length, "Created from the workspace", "teal")}
      ${renderKpi("Allowed", allowed, "Released after evaluation")}
      ${renderKpi("Warnings", warned, "Released with review signals", "amber")}
      ${renderKpi("Blocked", blocked, blocked ? "Stopped before unsafe release" : "No live block yet", blocked ? "red" : "")}
    </section>
    <section class="panel activity-panel">
      <div class="panel-heading"><div><span class="section-kicker">Decision stream</span><h2>Most recent evaluations</h2></div><div class="refresh-label"><span class="live-dot"></span> Listening for workspace events</div></div>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>System</th><th>Policy event</th><th>Decision</th><th>Stage</th><th>Correlation</th></tr></thead><tbody>${renderLiveActivityRows(runs, 10)}</tbody></table></div>
    </section>
    <section class="explain-grid">
      <article class="mini-panel"><span class="step-mark">01</span><h3>Preflight</h3><p>Intent, restricted patterns, sensitive data, and tenant context are evaluated before provider access.</p></article>
      <article class="mini-panel"><span class="step-mark">02</span><h3>Postflight</h3><p>The candidate answer is evaluated before any customer or employee can see it.</p></article>
      <article class="mini-panel"><span class="step-mark">03</span><h3>Evidence</h3><p>Decision, policy reasons, correlation data, and incidents stay linked in one audit trail.</p></article>
    </section>`;
}

function renderIncidents(runs: PitchConsoleRun[]) {
  const blockedRuns = runs.filter((run) => run.blocked);
  const liveCards = blockedRuns.map((run, index) => `
    <article class="incident-card critical">
      <div class="incident-icon">!</div>
      <div class="incident-content">
        <div class="incident-top"><div>${badge("CRITICAL", "danger")} ${badge("OPEN", "warning")}</div><span>${escapeHtml(formatRelative(run.createdAt))}</span></div>
        <h3>Restricted content and PII request blocked</h3>
        <p>${escapeHtml(run.decisionSummary || "The request crossed runtime policy and was stopped before model execution.")}</p>
        <div class="incident-meta"><span><strong>System</strong> Collections Hardship Assistant</span><span><strong>Case</strong> ${escapeHtml(run.caseReference)}</span><span><strong>Owner</strong> AI Risk Operations</span><span><strong>Contain by</strong> 15 minutes</span></div>
        <div class="reason-list">${[...run.thresholdBreaches, ...run.reasonCodes].slice(0, 5).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
      </div>
      <div class="incident-id"><span>${escapeHtml(run.escalatedIncidentId || `INC-DEMO-${index + 1}`)}</span><small>${escapeHtml(compactId(run.correlationId))}</small></div>
    </article>`).join("");

  return `
    <section class="page-heading">
      <div><div class="eyebrow">Operational response</div><h1>AI incidents</h1><p>Policy breaches become owned containment work with evidence already attached.</p></div>
      ${badge(`${blockedRuns.length + 1} OPEN`, blockedRuns.length ? "danger" : "warning")}
    </section>
    <section class="kpi-grid compact">
      ${renderKpi("Open", blockedRuns.length + 1, "Requires operator action", blockedRuns.length ? "red" : "amber")}
      ${renderKpi("Contained", 3, "Within target window", "teal")}
      ${renderKpi("Mean containment", "11m", "Synthetic scenario value")}
      ${renderKpi("Evidence linked", "100%", "Decision and policy receipt", "teal")}
    </section>
    <section class="incident-list">
      ${liveCards || `<div class="empty-live"><span class="pulse-ring"></span><div><strong>Waiting for the red prompt</strong><p>Blocked workspace events will appear here automatically.</p></div></div>`}
      <article class="incident-card warning">
        <div class="incident-icon">!</div>
        <div class="incident-content">
          <div class="incident-top"><div>${badge("HIGH", "warning")} ${badge("INVESTIGATING", "neutral")}</div><span>18m ago · seeded</span></div>
          <h3>Voice assistant prompt-disclosure attempt</h3>
          <p>An attempt to reveal internal instructions was blocked at preflight. The containment playbook is in progress.</p>
          <div class="incident-meta"><span><strong>System</strong> Voice Banking Assistant</span><span><strong>Owner</strong> Secure Servicing</span><span><strong>SLA</strong> 42 minutes left</span></div>
        </div>
        <div class="incident-id"><span>INC-1048</span><small>66b2…4aa1</small></div>
      </article>
      <article class="incident-card resolved">
        <div class="incident-icon">✓</div>
        <div class="incident-content">
          <div class="incident-top"><div>${badge("MEDIUM", "neutral")} ${badge("RESOLVED", "success")}</div><span>Yesterday · seeded</span></div>
          <h3>Retail copilot reliability threshold breach</h3>
          <p>Error-rate drift triggered review. The affected deployment was rolled back and the post-incident review was linked to its evidence record.</p>
          <div class="incident-meta"><span><strong>System</strong> Retail Support Resolution Copilot</span><span><strong>Owner</strong> Digital Service</span><span><strong>Contained</strong> 9 minutes</span></div>
        </div>
        <div class="incident-id"><span>INC-1039</span><small>91c4…e271</small></div>
      </article>
    </section>`;
}

function renderDecisions(runs: PitchConsoleRun[]) {
  const liveRows = runs.map((run) => `
    <article class="trace-card">
      <div class="trace-rail ${decisionTone(run.decision)}"></div>
      <div class="trace-main">
        <div class="trace-top"><div>${badge(run.decision.toUpperCase(), decisionTone(run.decision))}<span class="trace-time">${escapeHtml(formatClock(run.createdAt))} · ${escapeHtml(run.agentName)}</span></div><span class="mono">${escapeHtml(compactId(run.telemetryEventId || run.id))}</span></div>
        <h3>${escapeHtml(run.caseReference)} · ${escapeHtml(run.modeLabel)}</h3>
        <p class="trace-prompt">“${escapeHtml(run.prompt)}”</p>
        <div class="trace-grid"><span><small>Response stage</small><strong>${run.modelCallExecuted ? "Generated" : "Skipped"}</strong></span><span><small>Decision stage</small><strong>${escapeHtml(run.decisionStage || "—")}</strong></span><span><small>Released</small><strong>${run.releasedToEndUser ? "Yes" : "No"}</strong></span><span><small>Evidence receipt</small><strong>Captured</strong></span></div>
        <div class="trace-footer"><span>${escapeHtml(run.decisionSummary || run.runtimeSummary)}</span><span class="mono">Correlation ${escapeHtml(compactId(run.correlationId))}</span></div>
      </div>
    </article>`).join("");

  return `
    <section class="page-heading">
      <div><div class="eyebrow">Traceability</div><h1>Decision evidence</h1><p>What was requested, what policy decided, whether the model ran, and what reached the user.</p></div>
      ${badge(`${runs.length} LIVE TRACE${runs.length === 1 ? "" : "S"}`, runs.length ? "success" : "neutral")}
    </section>
    <section class="trace-list">
      ${liveRows || `<div class="empty-live tall"><span class="pulse-ring"></span><div><strong>No live decision traces yet</strong><p>Open the frontline workspace and run the green prompt. The trace will appear here automatically.</p><a class="button primary" href="/" target="_blank" rel="noreferrer">Open workspace ↗</a></div></div>`}
      <article class="trace-card seeded">
        <div class="trace-rail success"></div>
        <div class="trace-main">
          <div class="trace-top"><div>${badge("ALLOW", "success")}<span class="trace-time">09:42:18 · Mia Foster · seeded</span></div><span class="mono">evt…7b92</span></div>
          <h3>COL-48211 · Claims Support</h3>
          <p class="trace-prompt">“Summarise the evidence still needed for the hardship review.”</p>
          <div class="trace-grid"><span><small>Response stage</small><strong>Generated</strong></span><span><small>Decision stage</small><strong>output</strong></span><span><small>Released</small><strong>Yes</strong></span><span><small>Evidence receipt</small><strong>Captured</strong></span></div>
          <div class="trace-footer"><span>Prompt and candidate response passed the active runtime policy.</span><span class="mono">Correlation a31f…9c20</span></div>
        </div>
      </article>
    </section>`;
}

export function normalizePitchConsoleView(value: unknown): PitchConsoleView {
  if (value === "registry" || value === "runtime" || value === "incidents" || value === "decisions") {
    return value;
  }
  return "dashboard";
}

export function renderPitchConsolePanel(view: PitchConsoleView, runs: PitchConsoleRun[]) {
  if (view === "registry") return renderRegistry();
  if (view === "runtime") return renderRuntime(runs);
  if (view === "incidents") return renderIncidents(runs);
  if (view === "decisions") return renderDecisions(runs);
  return renderDashboard(runs);
}

export function renderPitchConsolePage({ view, runs, workspaceUrl }: RenderConsoleOptions) {
  const navItems: Array<{ id: PitchConsoleView; label: string; icon: string; path: string }> = [
    { id: "dashboard", label: "Command center", icon: "⌂", path: "/control-grid" },
    { id: "registry", label: "AI registry", icon: "▦", path: "/control-grid/registry" },
    { id: "runtime", label: "Runtime monitoring", icon: "⌁", path: "/control-grid/runtime" },
    { id: "incidents", label: "Incidents", icon: "!", path: "/control-grid/incidents" },
    { id: "decisions", label: "Decision trace", icon: "◇", path: "/control-grid/decisions" },
  ];
  const panel = renderPitchConsolePanel(view, runs);
  const safeView = JSON.stringify(view);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${view === "dashboard" ? "Command Center" : navItems.find((item) => item.id === view)?.label} · AI CONTROL GRID</title>
  <style>${renderConsoleStyles()}</style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="/control-grid"><span class="brand-mark"><i></i><i></i><i></i></span><span><strong>AI CONTROL GRID</strong><small>Developed by ACTURUS</small></span></a>
      <div class="demo-badge"><span class="live-dot"></span><div><strong>Pitch demo</strong><small>Synthetic · offline</small></div></div>
      <nav>
        <span class="nav-label">Governance operations</span>
        ${navItems.map((item) => `<a class="nav-item ${item.id === view ? "active" : ""}" href="${item.path}"><span class="nav-icon">${item.icon}</span>${item.label}${item.id === "incidents" && runs.some((run) => run.blocked) ? `<b>${runs.filter((run) => run.blocked).length}</b>` : ""}</a>`).join("")}
        <span class="nav-label second">Demo surface</span>
        <a class="nav-item workspace-link" href="${escapeHtml(workspaceUrl)}" target="_blank" rel="noreferrer"><span class="nav-icon">↗</span>Frontline workspace</a>
      </nav>
      <div class="sidebar-footer">
        <div class="tenant-avatar">NS</div><div><strong>Northstar Consumer Bank</strong><small>PilotWave Holdings</small></div><span>⌄</span>
      </div>
    </aside>
    <div class="content-shell">
      <header class="topbar">
        <div class="crumbs"><span>PilotWave Holdings</span><b>/</b><strong>Northstar Consumer Bank</strong></div>
        <div class="top-actions"><span class="secure-label">● Local deterministic mode</span><button aria-label="Notifications">♢</button><div class="user-avatar">OG</div></div>
      </header>
      <main id="live-panel">${panel}</main>
      <footer><span>AI CONTROL GRID pitch environment</span><span>All organisations, people, events, and metrics shown here are synthetic.</span></footer>
    </div>
  </div>
  <script>
    (() => {
      const view = ${safeView};
      let lastMarkup = "";
      async function refreshPanel() {
        if (document.hidden) return;
        try {
          const response = await fetch("/control-grid/fragment?view=" + encodeURIComponent(view), { cache: "no-store" });
          if (!response.ok) return;
          const markup = await response.text();
          if (markup && markup !== lastMarkup) {
            const panel = document.getElementById("live-panel");
            if (panel && panel.innerHTML !== markup) panel.innerHTML = markup;
            lastMarkup = markup;
          }
        } catch (_) {}
      }
      window.setInterval(refreshPanel, 1500);
    })();
  </script>
</body>
</html>`;
}

function renderConsoleStyles() {
  return `
    :root{--ink:#15211f;--muted:#64716f;--line:#dce3e1;--soft:#f3f6f5;--paper:#fbfcfb;--white:#fff;--teal:#0c8176;--teal-dark:#075d56;--teal-soft:#e7f5f1;--red:#c23c3c;--red-soft:#fff0ef;--amber:#b06b13;--amber-soft:#fff6df;--sidebar:#142421;--shadow:0 18px 45px rgba(22,38,34,.08)}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--ink);background:#eef2f1}body{font-size:14px}.app-shell{min-height:100vh;display:grid;grid-template-columns:254px minmax(0,1fr)}
    .sidebar{position:sticky;top:0;height:100vh;background:linear-gradient(180deg,#172925,#10201d);color:#dce9e6;padding:24px 18px 18px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;color:white;text-decoration:none;padding:0 9px 22px}.brand>span:last-child{display:flex;flex-direction:column}.brand strong{font-size:14px;letter-spacing:.08em}.brand small{font-size:10px;color:#91aaa4;margin-top:3px;letter-spacing:.08em;text-transform:uppercase}.brand-mark{width:32px;height:32px;border-radius:10px;background:#f4fbf9;position:relative;display:grid;place-items:center;box-shadow:0 8px 20px rgba(0,0,0,.2)}.brand-mark i{position:absolute;width:13px;height:13px;border:1.5px solid var(--teal);transform:rotate(45deg)}.brand-mark i:nth-child(2){width:8px;height:8px}.brand-mark i:nth-child(3){width:3px;height:3px;background:var(--teal)}
    .demo-badge{margin:0 4px 25px;padding:11px 12px;border:1px solid rgba(126,199,186,.2);background:rgba(16,129,117,.13);border-radius:12px;display:flex;align-items:center;gap:10px}.demo-badge div{display:flex;flex-direction:column}.demo-badge strong{font-size:12px;color:#effbf8}.demo-badge small{font-size:10px;color:#94b7af;margin-top:2px;text-transform:uppercase;letter-spacing:.08em}.live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#19bca8;box-shadow:0 0 0 5px rgba(25,188,168,.12);flex:0 0 auto}
    nav{display:flex;flex-direction:column;gap:4px}.nav-label{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:#718a84;padding:0 11px 8px}.nav-label.second{margin-top:18px}.nav-item{height:42px;border-radius:10px;color:#aebfbb;text-decoration:none;display:flex;align-items:center;gap:11px;padding:0 11px;font-weight:560;font-size:13px;transition:.15s ease}.nav-item:hover{background:rgba(255,255,255,.055);color:#f7fffd}.nav-item.active{color:white;background:linear-gradient(90deg,rgba(23,160,145,.25),rgba(23,160,145,.10));box-shadow:inset 2px 0 #25b5a3}.nav-icon{width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.055);display:grid;place-items:center;font-weight:700}.nav-item.active .nav-icon{background:rgba(33,187,169,.2)}.nav-item b{margin-left:auto;min-width:20px;height:20px;border-radius:10px;background:#c94a46;color:white;font-size:10px;display:grid;place-items:center}.workspace-link{border:1px dashed rgba(139,181,171,.22);margin-top:2px}
    .sidebar-footer{margin-top:auto;border-top:1px solid rgba(255,255,255,.08);padding:18px 6px 2px;display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:9px}.tenant-avatar,.user-avatar{width:34px;height:34px;border-radius:50%;background:#d8eee9;color:#0c7066;display:grid;place-items:center;font-weight:800;font-size:11px}.sidebar-footer div:nth-child(2){display:flex;flex-direction:column;min-width:0}.sidebar-footer strong{font-size:10px;color:#e8f3f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar-footer small{font-size:9px;color:#78928c;margin-top:3px}.sidebar-footer>span{color:#6e8781}
    .content-shell{min-width:0;background:radial-gradient(circle at top right,rgba(30,166,148,.07),transparent 27%),#f5f7f6}.topbar{height:66px;border-bottom:1px solid var(--line);background:rgba(251,252,251,.92);backdrop-filter:blur(15px);display:flex;align-items:center;justify-content:space-between;padding:0 34px;position:sticky;top:0;z-index:5}.crumbs{display:flex;gap:9px;align-items:center;font-size:12px;color:#7d8987}.crumbs b{font-weight:400;color:#b9c1bf}.crumbs strong{color:#293835}.top-actions{display:flex;align-items:center;gap:13px}.secure-label{font-size:10px;color:#52706a;background:#edf5f3;border:1px solid #d9e8e4;border-radius:18px;padding:7px 10px}.secure-label::first-letter{color:#15a38f}.top-actions button{width:34px;height:34px;border:1px solid var(--line);background:white;border-radius:9px;color:#62706d}
    main{padding:32px 34px 45px;max-width:1540px;width:100%;margin:0 auto}.hero-card{border-radius:18px;background:radial-gradient(circle at 90% 0,rgba(61,188,170,.17),transparent 32%),linear-gradient(135deg,#152925,#1d3934);color:white;padding:34px 36px;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:32px;box-shadow:var(--shadow);overflow:hidden}.eyebrow,.section-kicker{text-transform:uppercase;letter-spacing:.12em;font-size:10px;font-weight:750;color:#55706b}.hero-card .eyebrow{color:#9fc8bf;display:flex;align-items:center;gap:9px}.hero-card h1,.page-heading h1{margin:13px 0 9px;font-size:30px;letter-spacing:-.035em;line-height:1.08}.hero-card p{color:#b7cbc6;max-width:690px;line-height:1.55;margin:0}.hero-actions{display:flex;gap:10px;margin-top:23px}.button{height:38px;border-radius:9px;padding:0 15px;border:1px solid transparent;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:700;font-size:12px;cursor:pointer}.button.primary{background:var(--teal);color:white;box-shadow:0 7px 18px rgba(8,104,94,.22)}.button.primary:hover{background:#0a746a}.button.secondary{background:white;border-color:var(--line);color:#273733}.hero-card .button.secondary{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:white}.button:disabled{opacity:.55;cursor:not-allowed}.hero-signal{border:1px solid rgba(255,255,255,.13);border-radius:14px;background:rgba(255,255,255,.06);padding:20px;align-self:stretch}.signal-label{text-transform:uppercase;letter-spacing:.12em;color:#8db1a9;font-size:9px}.hero-signal strong{display:block;font-size:18px;line-height:1.3;margin:12px 0 7px}.hero-signal p{font-size:11px;line-height:1.5}.signal-bar{height:5px;border-radius:5px;background:rgba(255,255,255,.1);margin-top:18px;overflow:hidden}.signal-bar span{display:block;height:100%;border-radius:5px;background:#29b9a7;transition:width .35s ease}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:16px}.kpi-grid.compact{margin:22px 0 16px}.kpi-card{border:1px solid var(--line);background:var(--white);border-radius:14px;padding:18px 19px;box-shadow:0 8px 22px rgba(27,45,40,.035);position:relative;overflow:hidden}.kpi-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#cfd8d5}.kpi-card.teal::before{background:var(--teal)}.kpi-card.amber::before{background:#d7972d}.kpi-card.red::before{background:var(--red)}.kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#73807d}.kpi-value{font-size:28px;font-weight:760;letter-spacing:-.04em;margin:8px 0 4px}.kpi-detail{font-size:11px;color:#7a8583}
    .dashboard-grid{display:grid;grid-template-columns:1.18fr .82fr;gap:16px;margin-top:16px}.panel,.mini-panel{background:var(--white);border:1px solid var(--line);border-radius:15px;box-shadow:0 9px 25px rgba(25,42,38,.035)}.panel{padding:22px}.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.panel h2{font-size:16px;margin:5px 0 0;letter-spacing:-.02em}.badge{display:inline-flex;align-items:center;gap:6px;border-radius:20px;padding:5px 8px;font-size:9px;font-weight:800;letter-spacing:.06em;background:#eef2f1;color:#53615e;white-space:nowrap}.badge i{width:5px;height:5px;border-radius:50%;background:currentColor}.badge.success{background:var(--teal-soft);color:#087468}.badge.warning{background:var(--amber-soft);color:#9a5d0d}.badge.danger{background:var(--red-soft);color:#b53434}.badge.neutral{background:#f0f3f2;color:#586562}
    .path-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column}.path-list li{display:grid;grid-template-columns:32px 1fr;gap:12px;position:relative;padding:3px 0 18px}.path-list li:not(:last-child)::after{content:"";position:absolute;width:1px;background:#dde5e3;left:15px;top:33px;bottom:0}.path-list li>span{width:31px;height:31px;border-radius:50%;border:1px solid #d8e0de;color:#8c9895;display:grid;place-items:center;font-size:11px;font-weight:800;background:white;z-index:1}.path-list li.done>span{background:var(--teal-soft);color:var(--teal);border-color:#bce0d8}.path-list li.active>span{background:var(--teal);color:white;border-color:var(--teal);box-shadow:0 0 0 5px rgba(12,129,118,.1)}.path-list strong{font-size:12px}.path-list p{font-size:10.5px;color:#75817e;margin:4px 0 0;line-height:1.45}.score-ring{width:57px;height:57px;border:5px solid #d5eee9;border-top-color:var(--teal);border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;color:var(--teal);transform:rotate(8deg)}.score-ring small{font-size:8px;margin-left:-6px}.coverage-row{display:grid;grid-template-columns:1fr auto;gap:5px;margin:14px 0;font-size:11px}.coverage-row strong{font-size:10px}.coverage-row>div{grid-column:1/-1;height:5px;background:#edf1f0;border-radius:4px;overflow:hidden}.coverage-row i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),#36b5a4);border-radius:4px}.panel-note{font-size:9.5px!important;line-height:1.45;color:#899390!important;border-top:1px solid #edf0ef;padding-top:12px;margin:16px 0 0!important}.activity-panel{margin-top:16px;padding:0;overflow:hidden}.activity-panel .panel-heading{padding:20px 22px 0}.refresh-label{display:flex;align-items:center;gap:9px;color:#66817b;font-size:10px}.refresh-label .live-dot{width:6px;height:6px}
    .table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:850px}th{height:39px;background:#f7f9f8;text-align:left;padding:0 16px;font-size:9px;color:#7b8784;text-transform:uppercase;letter-spacing:.09em;border-top:1px solid #e9edec;border-bottom:1px solid #e3e9e7}td{padding:13px 16px;border-bottom:1px solid #edf0ef;font-size:11px;color:#4c5a57;vertical-align:middle}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:#fbfcfc}.primary-cell{font-size:11px;font-weight:680;color:#263532}.secondary-cell{font-size:9.5px;color:#87918f;margin-top:3px}.clamp{max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mono{font-family:"SFMono-Regular",Consolas,monospace;font-size:9.5px;color:#687673}.new-row{animation:rowFlash 1.2s ease-out}.new-row.warning{animation-name:rowFlashWarning}.new-row.danger{animation-name:rowFlashDanger}@keyframes rowFlash{0%{background:#ddf6ef}100%{background:transparent}}@keyframes rowFlashWarning{0%{background:#fff3d5}100%{background:transparent}}@keyframes rowFlashDanger{0%{background:#ffe7e4}100%{background:transparent}}
    .page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin:5px 0 6px}.page-heading h1{font-size:28px;margin:8px 0 7px}.page-heading p{margin:0;color:#6f7c79;line-height:1.5}.page-actions{display:flex;align-items:center;gap:10px}.toolbar{display:flex;gap:9px;margin-bottom:18px}.search-shell{height:37px;border:1px solid var(--line);background:#fafbfb;border-radius:9px;display:flex;align-items:center;gap:8px;padding:0 13px;color:#919b99;flex:1}.filter-chip{height:37px;border:1px solid var(--line);border-radius:9px;display:flex;align-items:center;padding:0 12px;color:#5f6d6a;font-size:10px}.registry-table td:first-child{width:33%}.tier-pill{display:inline-flex;padding:5px 8px;border:1px solid #dce4e2;border-radius:7px;background:#f9fbfa;font-size:9.5px;font-weight:700}.status-text{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:650}.status-text i{width:6px;height:6px;border-radius:50%;background:#1b9e8f}.status-text.in-review i{background:#e29325}.status-text.paused i{background:#a2aba9}.coverage-cell{display:flex;align-items:center;gap:8px}.coverage-cell strong{font-size:10px;width:28px}.coverage-cell>span{width:58px;height:5px;background:#edf1f0;border-radius:4px;overflow:hidden}.coverage-cell i{height:100%;display:block;background:var(--teal);border-radius:4px}.table-footer{display:flex;justify-content:space-between;padding:15px 16px 0;color:#899491;font-size:9.5px}.explain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.mini-panel{padding:18px}.mini-panel .step-mark{font-size:9px;color:var(--teal);letter-spacing:.1em;font-weight:800}.mini-panel h3{font-size:13px;margin:8px 0 5px}.mini-panel p{font-size:10.5px;line-height:1.5;color:#73807d;margin:0}
    .incident-list,.trace-list{display:flex;flex-direction:column;gap:12px;margin-top:18px}.incident-card{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;grid-template-columns:38px 1fr auto;gap:15px;box-shadow:0 8px 24px rgba(24,42,37,.035)}.incident-card.critical{border-left:3px solid var(--red)}.incident-card.warning{border-left:3px solid #d38a20}.incident-card.resolved{border-left:3px solid var(--teal)}.incident-icon{width:36px;height:36px;border-radius:10px;background:var(--red-soft);color:var(--red);display:grid;place-items:center;font-weight:900}.incident-card.warning .incident-icon{background:var(--amber-soft);color:#a56410}.incident-card.resolved .incident-icon{background:var(--teal-soft);color:var(--teal)}.incident-top{display:flex;align-items:center;justify-content:space-between;font-size:9.5px;color:#8a9592}.incident-content h3{font-size:14px;margin:10px 0 6px}.incident-content>p{font-size:10.5px;color:#6d7976;line-height:1.5;margin:0}.incident-meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px;font-size:9.5px;color:#798582}.incident-meta span{display:flex;gap:5px}.incident-meta strong{color:#41504d}.incident-id{text-align:right;display:flex;flex-direction:column;font-family:Consolas,monospace;font-size:10px;color:#4b5b57}.incident-id small{margin-top:8px;color:#8e9996}.reason-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px}.reason-list span{background:#fff4f2;color:#a33d36;border:1px solid #f1d7d3;border-radius:6px;padding:4px 6px;font-size:8.5px;font-family:Consolas,monospace}.empty-live{border:1px dashed #bcd8d2;background:#f1f8f6;border-radius:14px;padding:20px;display:flex;align-items:center;justify-content:center;gap:16px;color:#4a625d}.empty-live strong{font-size:12px}.empty-live p{font-size:10px;color:#778581;margin:4px 0 0}.pulse-ring{width:24px;height:24px;border:2px solid #88c9bd;border-radius:50%;position:relative}.pulse-ring::after{content:"";position:absolute;inset:4px;background:var(--teal);border-radius:50%;animation:pulse 1.5s infinite}@keyframes pulse{50%{opacity:.35;transform:scale(.75)}}
    .trace-card{background:white;border:1px solid var(--line);border-radius:14px;display:grid;grid-template-columns:4px 1fr;overflow:hidden;box-shadow:0 8px 24px rgba(24,42,37,.035)}.trace-rail.success{background:var(--teal)}.trace-rail.warning{background:#d38a20}.trace-rail.danger{background:var(--red)}.trace-main{padding:18px 20px}.trace-top{display:flex;justify-content:space-between;align-items:center}.trace-top>div{display:flex;align-items:center;gap:9px}.trace-time{font-size:9.5px;color:#82908c}.trace-main h3{font-size:14px;margin:13px 0 6px}.trace-prompt{font-size:11px;color:#5d6b68;background:#f7f9f8;border-radius:8px;padding:10px 12px;margin:0}.trace-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.trace-grid span{border:1px solid #e7ecea;border-radius:8px;padding:9px}.trace-grid small{display:block;font-size:8.5px;color:#899390;text-transform:uppercase;letter-spacing:.06em}.trace-grid strong{display:block;font-size:11px;margin-top:4px}.trace-footer{border-top:1px solid #edf0ef;margin-top:13px;padding-top:11px;display:flex;justify-content:space-between;gap:20px;color:#71807c;font-size:9.5px}.empty-live.tall{min-height:180px;text-align:left}.empty-live.tall p{margin-bottom:12px}
    footer{padding:17px 34px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:#8b9693;font-size:9px;background:#f8faf9}
    @media(max-width:1050px){.app-shell{grid-template-columns:78px 1fr}.sidebar{padding:22px 10px}.brand>span:last-child,.demo-badge div,.nav-label,.nav-item:not(.active){font-size:0}.brand{padding-left:12px}.demo-badge{justify-content:center;padding:12px}.nav-item{justify-content:center;padding:0}.nav-item.active{font-size:0}.sidebar-footer div:nth-child(2),.sidebar-footer>span{display:none}.sidebar-footer{grid-template-columns:1fr;justify-items:center}.hero-card{grid-template-columns:1fr}.dashboard-grid{grid-template-columns:1fr}.kpi-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:720px){.app-shell{display:block}.sidebar{position:static;height:auto;flex-direction:row;align-items:center;padding:10px}.sidebar nav{flex-direction:row;overflow:auto;margin-left:auto}.sidebar .demo-badge,.sidebar-footer,.workspace-link{display:none}.brand{padding:0}.nav-item{min-width:42px}.content-shell .topbar{padding:0 16px}.crumbs span,.secure-label{display:none}main{padding:22px 16px}.hero-card{padding:25px}.kpi-grid{grid-template-columns:1fr 1fr}.page-heading{align-items:flex-start;flex-direction:column}.incident-card{grid-template-columns:32px 1fr}.incident-id{grid-column:2;text-align:left}.trace-grid{grid-template-columns:1fr 1fr}.trace-footer{flex-direction:column}.explain-grid{grid-template-columns:1fr}footer{padding:16px;gap:15px;flex-direction:column}}
  `;
}
