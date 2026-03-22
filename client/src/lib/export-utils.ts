import type { AiSystem, SystemControl, ComplianceControl, ApprovalWorkflow, AuditLog } from "@shared/schema";
import type { AnalyticsOverviewResponse, AnalyticsReportPresetId } from "@shared/analytics-overview";
import type { AnalyticsReportPlan, AnalyticsReportSectionId } from "@shared/analytics-report-builder";

export function exportToCsv(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSystemRegistryCsv(systems: AiSystem[]) {
  const data = systems.map((s) => ({
    Name: s.name,
    Owner: s.owner,
    Department: s.department || "",
    "Risk Level": s.riskLevel,
    Status: s.status,
    Vendor: s.vendor || "",
    "Model Type": s.modelType || "",
    "Data Sensitivity": s.dataSensitivity || "",
    Geography: s.geography || "",
    "Users Impacted": s.usersImpacted || 0,
    "Created At": s.createdAt ? new Date(s.createdAt).toISOString() : "",
  }));
  exportToCsv(data, "ai-system-registry");
}

export function exportComplianceSummaryCsv(
  systems: AiSystem[],
  systemControls: SystemControl[],
  complianceControls: ComplianceControl[]
) {
  const controlMap = new Map(complianceControls.map((c) => [c.id, c]));
  const systemMap = new Map(systems.map((s) => [s.id, s]));

  const data = systemControls.map((sc) => {
    const cc = controlMap.get(sc.controlId);
    const sys = systemMap.get(sc.systemId);
    return {
      System: sys?.name || sc.systemId,
      Framework: cc?.framework === "eu_ai_act" ? "EU AI Act" : cc?.framework === "nist_ai_rmf" ? "NIST AI RMF" : "ISO 42001",
      "Control ID": cc?.controlId || "",
      "Control Name": cc?.controlName || "",
      Status: sc.status,
      Assignee: sc.assignee || "",
      Evidence: sc.evidence || "",
      Notes: sc.notes || "",
    };
  });
  exportToCsv(data, "compliance-summary");
}

export function exportAuditTrailCsv(logs: AuditLog[]) {
  const data = logs.map((l) => ({
    "Date": l.createdAt ? new Date(l.createdAt).toISOString() : "",
    "Entity Type": l.entityType,
    Action: l.action,
    "Performed By": l.performedBy,
    Details: l.details || "",
  }));
  exportToCsv(data, "audit-trail");
}

export async function exportSystemEvidencePdf(
  system: AiSystem,
  systemControls: SystemControl[],
  complianceControls: ComplianceControl[],
  workflows: ApprovalWorkflow[],
  auditLogs: AuditLog[]
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  const controlMap = new Map(complianceControls.map((c) => [c.id, c]));
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("AI System Evidence Report", 14, 22);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated: ${now}`, 14, 30);
  doc.text("AI Control Tower - Enterprise Governance Platform", 14, 36);

  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(14, 40, 196, 40);

  let y = 48;
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("System Profile", 14, y);
  y += 8;

  const profileData = [
    ["Name", system.name],
    ["Owner", system.owner],
    ["Department", system.department || "N/A"],
    ["Risk Level", system.riskLevel.toUpperCase()],
    ["Status", system.status.replace("_", " ")],
    ["Vendor", system.vendor || "Internal"],
    ["Model Type", system.modelType || "N/A"],
    ["Data Sensitivity", system.dataSensitivity || "N/A"],
    ["Geography", system.geography || "N/A"],
    ["Users Impacted", String(system.usersImpacted || 0)],
    ["Deployment Context", system.deploymentContext || "N/A"],
  ];

  autoTable(doc, {
    startY: y,
    body: profileData,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  if (system.description) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Description", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(system.description, 180);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 8;
  }

  if (systemControls.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Compliance Controls", 14, y);
    y += 4;

    const verified = systemControls.filter((c) => c.status === "verified").length;
    const implemented = systemControls.filter((c) => c.status === "implemented").length;
    const total = systemControls.length;
    const rate = Math.round(((verified + implemented) / total) * 100);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    y += 4;
    doc.text(`Compliance Rate: ${rate}% (${verified + implemented}/${total} controls compliant)`, 14, y);
    y += 6;

    const controlRows = systemControls.map((sc) => {
      const cc = controlMap.get(sc.controlId);
      return [
        cc?.controlId || "",
        cc?.controlName || "Unknown",
        cc?.framework === "eu_ai_act" ? "EU AI Act" : cc?.framework === "nist_ai_rmf" ? "NIST" : "ISO",
        sc.status.replace("_", " "),
        sc.assignee || "",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["ID", "Control", "Framework", "Status", "Assignee"]],
      body: controlRows,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  if (workflows.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Approval Workflows", 14, y);
    y += 8;

    const wfRows = workflows.map((wf) => [
      wf.title,
      wf.status.replace("_", " "),
      wf.requestedBy,
      wf.reviewer || "",
      wf.priority || "",
      wf.createdAt ? new Date(wf.createdAt).toLocaleDateString() : "",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Title", "Status", "Requested By", "Reviewer", "Priority", "Date"]],
      body: wfRows,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  if (auditLogs.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Audit Trail", 14, y);
    y += 8;

    const logRows = auditLogs.map((l) => [
      l.createdAt ? new Date(l.createdAt).toLocaleString() : "",
      l.action,
      l.performedBy,
      l.details || "",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Action", "By", "Details"]],
      body: logRows,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`AI Control Tower - Confidential | Page ${i} of ${pageCount}`, 14, 290);
  }

  doc.save(`${system.name.replace(/\s+/g, "_")}_Evidence_Report.pdf`);
}

export function exportAnalyticsOverviewCsv(overview: AnalyticsOverviewResponse, presetId: AnalyticsReportPresetId) {
  const { summary, distributions, trends } = overview;

  const executiveRows = [
    { Metric: "Generated At", Value: overview.generatedAt, Preset: "Executive snapshot" },
    { Metric: "Total Systems", Value: summary.totalSystems, Preset: "Executive snapshot" },
    { Metric: "High-Risk Systems", Value: summary.highRiskSystems, Preset: "Executive snapshot" },
    { Metric: "Control Coverage %", Value: summary.controlCoverageRate, Preset: "Executive snapshot" },
    { Metric: "Evidence Coverage %", Value: summary.evidenceCoverageRate, Preset: "Executive snapshot" },
    { Metric: "Open Incidents", Value: summary.openIncidents, Preset: "Executive snapshot" },
    { Metric: "Containment SLA Breaches", Value: summary.breachedIncidents, Preset: "Executive snapshot" },
    { Metric: "Pending Workflows", Value: summary.pendingWorkflows, Preset: "Executive snapshot" },
  ];

  const incidentRows = trends.map((point) => ({
    Period: point.period,
    "Incidents Created": point.incidentsCreated,
    "Incidents Resolved": point.incidentsResolved,
    "Approvals Submitted": point.approvalsSubmitted,
    "Approvals Closed": point.approvalsClosed,
    "Evidence Added": point.evidenceAdded,
  }));

  const complianceRows = [
    ...distributions.controlStatuses.map((slice) => ({ Group: "Control status", Label: slice.label, Value: slice.value })),
    ...distributions.riskLevels.map((slice) => ({ Group: "Risk mix", Label: slice.label, Value: slice.value })),
    ...distributions.workflowStatuses.map((slice) => ({ Group: "Workflow status", Label: slice.label, Value: slice.value })),
  ];

  if (presetId === "incident_ops_review") {
    exportToCsv(incidentRows, "analytics-incident-ops-review");
    return;
  }

  if (presetId === "compliance_snapshot") {
    exportToCsv(complianceRows, "analytics-compliance-snapshot");
    return;
  }

  exportToCsv(executiveRows, "analytics-executive-snapshot");
}

function buildAnalyticsSectionRows(
  overview: AnalyticsOverviewResponse,
  sectionId: AnalyticsReportSectionId,
  planName: string,
): Record<string, any>[] {
  switch (sectionId) {
    case "summary":
      return [
        { Section: "Summary", Metric: "Generated At", Value: overview.generatedAt, Plan: planName },
        { Section: "Summary", Metric: "Total Systems", Value: overview.summary.totalSystems, Plan: planName },
        { Section: "Summary", Metric: "High-Risk Systems", Value: overview.summary.highRiskSystems, Plan: planName },
        { Section: "Summary", Metric: "Control Coverage %", Value: overview.summary.controlCoverageRate, Plan: planName },
        { Section: "Summary", Metric: "Evidence Coverage %", Value: overview.summary.evidenceCoverageRate, Plan: planName },
        { Section: "Summary", Metric: "Open Incidents", Value: overview.summary.openIncidents, Plan: planName },
        { Section: "Summary", Metric: "Containment SLA Breaches", Value: overview.summary.breachedIncidents, Plan: planName },
        { Section: "Summary", Metric: "Pending Workflows", Value: overview.summary.pendingWorkflows, Plan: planName },
      ];
    case "highlights":
      return overview.highlights.map((highlight, index) => ({
        Section: "Highlights",
        Metric: `Highlight ${index + 1}`,
        Value: highlight,
        Plan: planName,
      }));
    case "trends":
      return overview.trends.map((point) => ({
        Section: "Trends",
        Metric: point.period,
        "Incidents Created": point.incidentsCreated,
        "Incidents Resolved": point.incidentsResolved,
        "Approvals Submitted": point.approvalsSubmitted,
        "Approvals Closed": point.approvalsClosed,
        "Evidence Added": point.evidenceAdded,
        Plan: planName,
      }));
    case "risk_mix":
      return overview.distributions.riskLevels.map((slice) => ({
        Section: "Risk mix",
        Label: slice.label,
        Value: slice.value,
        Plan: planName,
      }));
    case "workflow_mix":
      return overview.distributions.workflowStatuses.map((slice) => ({
        Section: "Workflow mix",
        Label: slice.label,
        Value: slice.value,
        Plan: planName,
      }));
    case "incident_mix":
      return overview.distributions.incidentSeverities.map((slice) => ({
        Section: "Incident severity mix",
        Label: slice.label,
        Value: slice.value,
        Plan: planName,
      }));
    case "control_mix":
      return overview.distributions.controlStatuses.map((slice) => ({
        Section: "Control coverage mix",
        Label: slice.label,
        Value: slice.value,
        Plan: planName,
      }));
    default:
      return [];
  }
}

export function exportAnalyticsReportPlanCsv(overview: AnalyticsOverviewResponse, plan: AnalyticsReportPlan) {
  const rows = plan.sections.flatMap((sectionId) => buildAnalyticsSectionRows(overview, sectionId, plan.name));
  exportToCsv(rows, buildFileSafeName(plan.name));
}

export async function exportAnalyticsOverviewPdf(
  overview: AnalyticsOverviewResponse,
  presetId: AnalyticsReportPresetId,
) {
  const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);
  const doc = new jsPDF();
  const presetLabel =
    presetId === "incident_ops_review"
      ? "Incident operations review"
      : presetId === "compliance_snapshot"
        ? "Compliance snapshot"
        : "Executive snapshot";

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`AI Control Tower ${presetLabel}`, 14, 22);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date(overview.generatedAt).toLocaleString()}`, 14, 30);

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 14, 42);

  const summaryRows = [
    `Total systems: ${overview.summary.totalSystems}`,
    `High-risk systems: ${overview.summary.highRiskSystems}`,
    `Control coverage: ${overview.summary.controlCoverageRate}%`,
    `Evidence coverage: ${overview.summary.evidenceCoverageRate}%`,
    `Open incidents: ${overview.summary.openIncidents}`,
    `Containment SLA breaches: ${overview.summary.breachedIncidents}`,
    `Pending workflows: ${overview.summary.pendingWorkflows}`,
    `Decision trace coverage: ${overview.summary.decisionTraceCoverageRate}%`,
  ];

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  summaryRows.forEach((row, index) => {
    doc.text(`- ${row}`, 18, 50 + index * 6);
  });

  doc.setFont("helvetica", "bold");
  doc.text("Highlights", 14, 104);
  doc.setFont("helvetica", "normal");
  overview.highlights.forEach((highlight, index) => {
    const wrapped = doc.splitTextToSize(`- ${highlight}`, 176);
    doc.text(wrapped, 18, 112 + index * 14);
  });

  doc.save(`analytics-${presetId}.pdf`);
}

export async function exportAnalyticsReportPlanPdf(
  overview: AnalyticsOverviewResponse,
  plan: AnalyticsReportPlan,
) {
  const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`AI Control Tower ${plan.name}`, 14, 22);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date(overview.generatedAt).toLocaleString()}`, 14, 30);
  doc.text(`Cadence: ${plan.cadence}`, 14, 36);

  let y = 48;
  for (const sectionId of plan.sections) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(sectionId.replace(/_/g, " "), 14, y);
    y += 8;

    const rows = buildAnalyticsSectionRows(overview, sectionId, plan.name);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    for (const row of rows.slice(0, 12)) {
      const rendered = Object.entries(row)
        .filter(([key]) => key !== "Plan" && key !== "Section")
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");
      const wrapped = doc.splitTextToSize(rendered, 180);
      doc.text(wrapped, 18, y);
      y += wrapped.length * 4 + 2;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    }
    y += 4;
  }

  doc.save(`${buildFileSafeName(plan.name)}.pdf`);
}

function buildFileSafeName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "analytics-report";
}
