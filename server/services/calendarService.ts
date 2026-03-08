import { storage } from "../storage";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class CalendarService {
  async getCalendarEvents(params: {
    organizationId: string;
    actor: Actor;
    membershipRole: string;
    month?: string;
    type?: string;
  }) {
    const userName = params.actor.fullName;
    const isExecutive = ["owner", "admin", "cro", "ciso", "compliance_lead"].includes(params.membershipRole);

    let rangeStart: Date;
    let rangeEnd: Date;
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      const [year, month] = params.month.split("-").map(Number);
      rangeStart = new Date(year, month - 1, 1);
      rangeEnd = new Date(year, month, 0, 23, 59, 59);
      rangeStart.setDate(rangeStart.getDate() - 7);
      rangeEnd.setDate(rangeEnd.getDate() + 7);
    } else {
      const now = new Date();
      rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
    }

    const [allSystems, allControls, allWorkflows, allEvidence] = await Promise.all([
      storage.getAiSystemsByOrg(params.organizationId),
      storage.getSystemControlsByOrg(params.organizationId),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      storage.getEvidenceFilesByOrg(params.organizationId),
    ]);

    const events: any[] = [];
    const now = new Date();

    const mySystems = isExecutive
      ? allSystems
      : allSystems.filter((s) => s.owner === userName || s.owner === params.actor.username);
    const mySystemIds = new Set(mySystems.map((s) => s.id));
    const systemNameMap = new Map(allSystems.map((s) => [s.id, s.name]));

    const myControls = isExecutive
      ? allControls
      : allControls.filter(
          (c) => c.assignee === userName || c.assignee === params.actor.username || mySystemIds.has(c.systemId),
        );

    for (const ctrl of myControls) {
      if (!ctrl.dueDate) continue;
      const dueDate = new Date(ctrl.dueDate);
      if (dueDate < rangeStart || dueDate > rangeEnd) continue;
      const isOverdue = dueDate < now && ctrl.status !== "verified" && ctrl.status !== "implemented";
      const isCompleted = ctrl.status === "verified" || ctrl.status === "implemented";
      events.push({
        id: `ctrl-${ctrl.id}`,
        title: `Control due: ${systemNameMap.get(ctrl.systemId) || "Unknown System"}`,
        date: ctrl.dueDate,
        type: isOverdue ? "overdue_control" : "control_deadline",
        priority: isOverdue ? "high" : dueDate.getTime() - now.getTime() < 7 * 86400000 ? "medium" : "low",
        status: isCompleted ? "completed" : isOverdue ? "overdue" : "upcoming",
        entityId: ctrl.systemId,
        entityType: "system",
        description: `${ctrl.assignee ? `Assigned to ${ctrl.assignee}` : "Unassigned"} · Status: ${ctrl.status.replace("_", " ")}`,
      });
    }

    const myWorkflows = isExecutive
      ? allWorkflows
      : allWorkflows.filter(
          (w) =>
            w.reviewer === userName ||
            w.reviewer === params.actor.username ||
            w.requestedBy === userName ||
            w.requestedBy === params.actor.username,
        );

    for (const wf of myWorkflows) {
      if ((wf.status !== "pending" && wf.status !== "in_review") || !wf.createdAt) continue;
      const created = new Date(wf.createdAt);
      const deadlineDate = new Date(created);
      deadlineDate.setDate(deadlineDate.getDate() + 7);
      if (deadlineDate < rangeStart || deadlineDate > rangeEnd) continue;
      const daysPending = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      events.push({
        id: `wf-${wf.id}`,
        title: `Review deadline: ${systemNameMap.get(wf.systemId) || "Approval Workflow"}`,
        date: deadlineDate.toISOString(),
        type: "approval_deadline",
        priority: daysPending > 5 ? "high" : "medium",
        status: daysPending > 7 ? "overdue" : "upcoming",
        entityId: wf.id,
        entityType: "workflow",
        description: `Requested by ${wf.requestedBy || "Unknown"} · Priority: ${wf.priority || "normal"}`,
      });
    }

    for (const ev of allEvidence) {
      if (!ev.createdAt) continue;
      const uploadDate = new Date(ev.createdAt);
      if (uploadDate < rangeStart || uploadDate > rangeEnd) continue;
      if (isExecutive || ev.uploadedBy === userName || ev.uploadedBy === params.actor.username || mySystemIds.has(ev.systemId)) {
        events.push({
          id: `ev-${ev.id}`,
          title: `Evidence uploaded: ${ev.fileName}`,
          date: ev.createdAt,
          type: "evidence_uploaded",
          priority: "low",
          status: "completed",
          entityId: ev.systemId,
          entityType: "system",
          description: `Uploaded by ${ev.uploadedBy || "Unknown"} · ${systemNameMap.get(ev.systemId) || ""}`,
        });
      }
    }

    for (const sys of mySystems) {
      const lastAssess = sys.lastAssessment ? new Date(sys.lastAssessment) : null;
      const daysSinceAssessment = lastAssess ? (now.getTime() - lastAssess.getTime()) / (1000 * 60 * 60 * 24) : 999;
      if (daysSinceAssessment < 90 && lastAssess) continue;
      const reassessDate = lastAssess ? new Date(lastAssess.getTime() + 90 * 86400000) : now;
      if (reassessDate < rangeStart || reassessDate > rangeEnd) continue;
      events.push({
        id: `reassess-${sys.id}`,
        title: `Reassessment due: ${sys.name}`,
        date: reassessDate.toISOString(),
        type: "reassessment_due",
        priority: daysSinceAssessment > 120 ? "high" : "medium",
        status: "upcoming",
        entityId: sys.id,
        entityType: "system",
        description: `Last assessed: ${lastAssess ? lastAssess.toLocaleDateString() : "Never"} · Risk: ${sys.riskLevel}`,
      });
    }

    const euAiActMilestones = [
      { date: "2025-02-02", title: "EU AI Act: Prohibited AI practices take effect", description: "Article 5 prohibitions enforced — unacceptable risk AI systems must be discontinued" },
      { date: "2025-08-02", title: "EU AI Act: GPAI model obligations begin", description: "General-purpose AI model providers must comply with transparency and documentation requirements" },
      { date: "2026-08-02", title: "EU AI Act: High-risk AI obligations begin", description: "Full compliance required for high-risk AI systems including conformity assessments, CE marking, and EU database registration" },
      { date: "2027-08-02", title: "EU AI Act: Annex I systems compliance", description: "High-risk AI systems in Annex I (safety components) must comply with all requirements" },
    ];

    for (const milestone of euAiActMilestones) {
      const milestoneDate = new Date(milestone.date);
      if (milestoneDate < rangeStart || milestoneDate > rangeEnd) continue;
      const isPast = milestoneDate < now;
      events.push({
        id: `reg-${milestone.date}`,
        title: milestone.title,
        date: milestone.date,
        type: "regulatory_milestone",
        priority: isPast ? "low" : "high",
        status: isPast ? "completed" : "upcoming",
        entityId: null,
        entityType: null,
        description: milestone.description,
      });
    }

    let filteredEvents = events;
    if (params.type && params.type !== "all") {
      filteredEvents = events.filter((e) => e.type === params.type);
    }

    filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return filteredEvents;
  }
}

export const calendarService = new CalendarService();
