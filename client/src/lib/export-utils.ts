import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AiSystem, SystemControl, ComplianceControl, ApprovalWorkflow, AuditLog } from "@shared/schema";

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

export function exportSystemEvidencePdf(
  system: AiSystem,
  systemControls: SystemControl[],
  complianceControls: ComplianceControl[],
  workflows: ApprovalWorkflow[],
  auditLogs: AuditLog[]
) {
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
