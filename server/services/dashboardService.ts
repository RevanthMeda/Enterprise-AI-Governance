import { storage } from "../storage";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class DashboardService {
  async getTrends(params: { organizationId: string; actor: Actor }) {
    const [systems, workflows, logs, evidence] = await Promise.all([
      storage.getAiSystemsByOrg(params.organizationId),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      storage.getAuditLogsByOrg(params.organizationId),
      storage.getEvidenceFilesByOrg(params.organizationId),
    ]);

    const now = new Date();
    const weekLabels: string[] = [];
    const weekStarts: Date[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      d.setHours(0, 0, 0, 0);
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - dayOfWeek);
      weekStarts.push(new Date(d));
      weekLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }

    const getWeekIndex = (date: Date | string | null) => {
      if (!date) return -1;
      const d = new Date(date);
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        if (d >= weekStarts[i]) return i;
      }
      return -1;
    };

    const riskTrends = weekLabels.map((label, i) => {
      const beforeEnd = i < weekStarts.length - 1 ? weekStarts[i + 1] : new Date();
      const sysBefore = systems.filter((s) => s.createdAt && new Date(s.createdAt) < beforeEnd);
      return {
        week: label,
        high: sysBefore.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable").length,
        limited: sysBefore.filter((s) => s.riskLevel === "limited").length,
        minimal: sysBefore.filter((s) => s.riskLevel === "minimal").length,
      };
    });

    const approvalTrends = weekLabels.map((label, i) => {
      const weekWfs = workflows.filter((w) => getWeekIndex(w.createdAt) === i);
      return {
        week: label,
        submitted: weekWfs.length,
        approved: weekWfs.filter((w) => w.status === "approved").length,
        rejected: weekWfs.filter((w) => w.status === "rejected").length,
      };
    });

    const auditTrends = weekLabels.map((label, i) => ({
      week: label,
      events: logs.filter((l) => getWeekIndex(l.createdAt) === i).length,
    }));

    const evidenceTrends = weekLabels.map((label, i) => {
      const beforeEnd = i < weekStarts.length - 1 ? weekStarts[i + 1] : new Date();
      return {
        week: label,
        total: evidence.filter((e) => e.createdAt && new Date(e.createdAt) < beforeEnd).length,
      };
    });

    return { riskTrends, approvalTrends, auditTrends, evidenceTrends };
  }
}

export const dashboardService = new DashboardService();
