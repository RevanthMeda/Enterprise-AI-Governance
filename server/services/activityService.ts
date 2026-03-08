import { storage } from "../storage";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class ActivityService {
  async getActivityDashboard(params: {
    organizationId: string;
    actor: Actor;
    membershipRole: string;
  }) {
    const userName = params.actor.fullName;
    const userRole = params.membershipRole;
    const isExecutive = ["owner", "admin", "cro", "ciso", "compliance_lead"].includes(userRole);

    const [allSystems, allControls, allWorkflows, notifications, allEvidence] = await Promise.all([
      storage.getAiSystemsByOrg(params.organizationId),
      storage.getSystemControlsByOrg(params.organizationId),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      storage.getNotificationsByOrgUser(params.organizationId, params.actor.id),
      storage.getEvidenceFilesByOrg(params.organizationId),
    ]);

    const mySystems = allSystems.filter((s) => s.owner === userName || s.owner === params.actor.username);
    const mySystemIds = new Set(mySystems.map((s) => s.id));

    const pendingMyReview = await storage.getApprovalWorkflowsByReviewerForOrg(params.organizationId, userName);
    const myAssignedControls = await storage.getSystemControlsByAssigneeForOrg(params.organizationId, userName);

    const mySystemControls = allControls.filter((c) => mySystemIds.has(c.systemId));

    const allMyControls = [...myAssignedControls];
    const assignedIds = new Set(myAssignedControls.map((c) => c.id));
    for (const sc of mySystemControls) {
      if (!assignedIds.has(sc.id)) allMyControls.push(sc);
    }

    const now = new Date();
    const overdueControls = allMyControls.filter(
      (c) => c.dueDate && new Date(c.dueDate) < now && c.status !== "verified" && c.status !== "implemented",
    );
    const controlsInProgress = allMyControls.filter((c) => c.status === "in_progress");
    const controlsNotStarted = allMyControls.filter((c) => c.status === "not_started");

    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    const tasksDueThisWeek = allMyControls.filter(
      (c) =>
        c.dueDate &&
        new Date(c.dueDate) >= now &&
        new Date(c.dueDate) <= oneWeekFromNow &&
        c.status !== "verified" &&
        c.status !== "implemented",
    );

    const unreadNotifications = notifications.filter((n) => !n.read);

    const highRiskSystems = isExecutive
      ? allSystems.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable")
      : mySystems.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable");

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentlyChangedHighRisk = highRiskSystems.filter(
      (s) => s.updatedAt && new Date(s.updatedAt) > oneWeekAgo,
    );

    const systemsWithoutEvidence = mySystems.filter((s) => !allEvidence.some((e) => e.systemId === s.id));

    const recentAuditLogs = (await storage.getAuditLogsByOrg(params.organizationId, { performedBy: userName })).slice(0, 10);

    const myRequestedWorkflows = allWorkflows.filter(
      (w) => w.requestedBy === userName || w.requestedBy === params.actor.username,
    );

    const approvalBottlenecks = isExecutive
      ? allWorkflows.filter((w) => {
          if (w.status !== "pending" && w.status !== "in_review") return false;
          if (!w.createdAt) return false;
          const daysPending = (Date.now() - new Date(w.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          return daysPending > 3;
        })
      : [];

    const controlGaps = isExecutive
      ? allControls.filter((c) => c.status === "not_started")
      : controlsNotStarted;

    return {
      summary: {
        mySystemsCount: mySystems.length,
        pendingReviewCount: pendingMyReview.length,
        myControlsCount: allMyControls.length,
        overdueControlsCount: overdueControls.length,
        unreadNotificationsCount: unreadNotifications.length,
        controlsInProgressCount: controlsInProgress.length,
        controlsNotStartedCount: controlsNotStarted.length,
        highRiskSystemsCount: highRiskSystems.length,
        evidenceMissingCount: systemsWithoutEvidence.length,
        tasksDueThisWeekCount: tasksDueThisWeek.length,
      },
      pendingMyReview: pendingMyReview.slice(0, 10),
      mySystems: mySystems.slice(0, 10),
      overdueControls: overdueControls.slice(0, 10),
      controlsInProgress: controlsInProgress.slice(0, 10),
      tasksDueThisWeek: tasksDueThisWeek.slice(0, 10),
      recentlyChangedHighRisk: recentlyChangedHighRisk.slice(0, 10),
      systemsWithoutEvidence: systemsWithoutEvidence.slice(0, 10),
      approvalBottlenecks: approvalBottlenecks.slice(0, 10),
      controlGaps: controlGaps.slice(0, 10),
      myRequestedWorkflows: myRequestedWorkflows.slice(0, 5),
      recentActivity: recentAuditLogs,
      userRole,
    };
  }
}

export const activityService = new ActivityService();
