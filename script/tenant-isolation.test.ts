import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import {
  organizations,
  memberships,
  users,
  aiSystems,
  systemControls,
  approvalWorkflows,
  evidenceFiles,
  complianceControls,
} from "../shared/schema";
import { storage } from "../server/storage";
import { controlService } from "../server/services/controlService";
import { exportService } from "../server/services/exportService";
import { evidenceService } from "../server/services/evidenceService";
import { workflowService } from "../server/services/workflowService";
import { dashboardService } from "../server/services/dashboardService";
import { activityService } from "../server/services/activityService";
import { calendarService } from "../server/services/calendarService";
import { requireTenant } from "../server/tenant";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

type Tracker = {
  organizationIds: string[];
  membershipIds: string[];
  userIds: string[];
  systemIds: string[];
  workflowIds: string[];
  evidenceIds: string[];
  complianceControlIds: string[];
  exportFilePaths: string[];
};

function makeSuffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function toActor(user: { id: string; username: string; fullName: string; email: string | null; role: string }): Actor {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
}

function makeMockRes() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

test("multi-tenant isolation hardening checks", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
    systemIds: [],
    workflowIds: [],
    evidenceIds: [],
    complianceControlIds: [],
    exportFilePaths: [],
  };

  try {
    const orgA = await storage.createOrganization({
      slug: `tenant-a-${suffix}`,
      name: `Tenant A ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(orgA.id);

    const orgB = await storage.createOrganization({
      slug: `tenant-b-${suffix}`,
      name: `Tenant B ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(orgB.id);

    const userA = await storage.createUser({
      username: `tenant_a_owner_${suffix}`,
      password: "test-password",
      fullName: `Tenant A Owner ${suffix}`,
      email: `tenant-a-owner-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(userA.id);

    const userAReviewer = await storage.createUser({
      username: `tenant_a_reviewer_${suffix}`,
      password: "test-password",
      fullName: `Tenant A Reviewer ${suffix}`,
      email: `tenant-a-reviewer-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(userAReviewer.id);

    const userB = await storage.createUser({
      username: `tenant_b_owner_${suffix}`,
      password: "test-password",
      fullName: `Tenant B Owner ${suffix}`,
      email: `tenant-b-owner-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(userB.id);

    const membershipA = await storage.createMembership({
      userId: userA.id,
      organizationId: orgA.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(membershipA.id);

    const membershipAReviewer = await storage.createMembership({
      userId: userAReviewer.id,
      organizationId: orgA.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: userA.id,
    });
    tracker.membershipIds.push(membershipAReviewer.id);

    const membershipB = await storage.createMembership({
      userId: userB.id,
      organizationId: orgB.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(membershipB.id);

    const actorA = toActor(userA);
    const actorB = toActor(userB);

    const systemA = await storage.createAiSystemForOrg(orgA.id, {
      name: `System A ${suffix}`,
      owner: actorA.fullName,
      riskLevel: "high",
      status: "active",
      description: "Tenant A system",
    });
    tracker.systemIds.push(systemA.id);

    const systemB = await storage.createAiSystemForOrg(orgB.id, {
      name: `System B ${suffix}`,
      owner: actorB.fullName,
      riskLevel: "limited",
      status: "active",
      description: "Tenant B system",
    });
    tracker.systemIds.push(systemB.id);

    const controlDefinition = await storage.createComplianceControl({
      framework: "eu_ai_act",
      controlId: `TENANT-CTRL-${suffix}`,
      controlName: `Tenant Isolation Control ${suffix}`,
      description: "Isolation test control",
      category: "Security",
      riskLevelApplicable: "high",
    });
    tracker.complianceControlIds.push(controlDefinition.id);

    let bulkAssignError: unknown;
    try {
      await controlService.bulkAssignControls({
        organizationId: orgA.id,
        actor: actorA,
        systemIds: [systemA.id, systemB.id],
        controlIds: [controlDefinition.id],
      });
    } catch (err) {
      bulkAssignError = err;
    }
    assert.ok(bulkAssignError instanceof Error);
    assert.match((bulkAssignError as Error).message, /Invalid systems for organization/);

    const workflowA = await workflowService.createWorkflow({
      organizationId: orgA.id,
      actor: actorA,
      input: {
        systemId: systemA.id,
        title: `Workflow A ${suffix}`,
        requestedBy: actorA.fullName,
        reviewer: userAReviewer.fullName,
        status: "pending",
        priority: "high",
      },
    });
    tracker.workflowIds.push(workflowA.id);

    const workflowB = await storage.createApprovalWorkflowForOrg(orgB.id, {
      systemId: systemB.id,
      title: `Workflow B ${suffix}`,
      requestedBy: actorB.fullName,
      reviewer: actorB.fullName,
      status: "pending",
      priority: "high",
    });
    tracker.workflowIds.push(workflowB.id);

    await assert.rejects(
      () =>
        workflowService.updateWorkflow({
          organizationId: orgA.id,
          actor: actorA,
          workflowId: workflowA.id,
          input: { systemId: systemB.id },
        }),
      /Linked system not found in active organization/,
    );

    await assert.rejects(
      () =>
        workflowService.updateWorkflow({
          organizationId: orgA.id,
          actor: actorA,
          workflowId: workflowA.id,
          input: { reviewer: actorB.fullName },
        }),
      /Reviewer is not an active user in the current organization/,
    );

    const exportA = await exportService.createExport({
      organizationId: orgA.id,
      actor: actorA,
      type: "ai_systems",
    });
    const exportVisibleToOrgB = await exportService.getExportForDownload({
      organizationId: orgB.id,
      exportId: exportA.exportId,
    });
    assert.equal(exportVisibleToOrgB, undefined);
    const exportVisibleToOrgA = await exportService.getExportForDownload({
      organizationId: orgA.id,
      exportId: exportA.exportId,
    });
    assert.ok(exportVisibleToOrgA);
    tracker.exportFilePaths.push(exportVisibleToOrgA.filePath);

    const evidenceA = await evidenceService.createEvidence({
      organizationId: orgA.id,
      actor: actorA,
      input: {
        systemId: systemA.id,
        fileName: `tenant-evidence-${suffix}.txt`,
        fileSize: 10,
        mimeType: "text/plain",
        filePath: `${orgA.id}/tenant-evidence-${suffix}.txt`,
      },
    });
    tracker.evidenceIds.push(evidenceA.id);

    const crossTenantEvidenceRead = await evidenceService.getEvidenceFile({
      organizationId: orgB.id,
      actor: actorB,
      evidenceId: evidenceA.id,
    });
    assert.equal(crossTenantEvidenceRead, undefined);

    await evidenceService.deleteEvidence({
      organizationId: orgB.id,
      actor: actorB,
      evidenceId: evidenceA.id,
    });

    const evidenceStillExistsInOrgA = await evidenceService.getEvidenceFile({
      organizationId: orgA.id,
      actor: actorA,
      evidenceId: evidenceA.id,
    });
    assert.ok(evidenceStillExistsInOrgA);

    const dashboardA = await dashboardService.getTrends({ organizationId: orgA.id, actor: actorA });
    const dashboardB = await dashboardService.getTrends({ organizationId: orgB.id, actor: actorB });
    const totalSubmittedA = dashboardA.approvalTrends.reduce((sum, week) => sum + week.submitted, 0);
    const totalSubmittedB = dashboardB.approvalTrends.reduce((sum, week) => sum + week.submitted, 0);
    assert.equal(totalSubmittedA, 1);
    assert.equal(totalSubmittedB, 1);

    const activityA = await activityService.getActivityDashboard({
      organizationId: orgA.id,
      actor: actorA,
      membershipRole: "owner",
    });
    assert.equal(activityA.summary.mySystemsCount, 1);
    assert.equal(activityA.mySystems.length, 1);
    assert.equal(activityA.mySystems[0]?.id, systemA.id);

    const calendarA = await calendarService.getCalendarEvents({
      organizationId: orgA.id,
      actor: actorA,
      membershipRole: "owner",
    });
    assert.ok(!calendarA.some((event) => event.entityId === systemB.id || event.entityId === workflowB.id));

    const calendarB = await calendarService.getCalendarEvents({
      organizationId: orgB.id,
      actor: actorB,
      membershipRole: "owner",
    });
    assert.ok(!calendarB.some((event) => event.entityId === systemA.id || event.entityId === workflowA.id));

    const validReq = {
      isAuthenticated: () => true,
      user: userA,
      header: () => undefined,
      session: { currentOrganizationId: orgA.id },
    };
    const validRes = makeMockRes();
    let validNextCalled = false;
    await requireTenant(validReq as any, validRes as any, () => {
      validNextCalled = true;
    });
    assert.equal(validNextCalled, true);
    assert.equal(validReq.session.currentOrganizationId, orgA.id);

    await db
      .delete(memberships)
      .where(and(eq(memberships.userId, userA.id), eq(memberships.organizationId, orgA.id)));

    const staleReq = {
      isAuthenticated: () => true,
      user: userA,
      header: () => undefined,
      session: { currentOrganizationId: orgA.id },
    };
    const staleRes = makeMockRes();
    let staleNextCalled = false;
    await requireTenant(staleReq as any, staleRes as any, () => {
      staleNextCalled = true;
    });
    assert.equal(staleNextCalled, false);
    assert.equal(staleRes.statusCode, 403);
  } finally {
    if (tracker.exportFilePaths.length > 0) {
      await Promise.all(
        tracker.exportFilePaths.map(async (filePath) => {
          try {
            await fs.unlink(filePath);
          } catch {
            // ignore cleanup failure
          }
        }),
      );
    }

    if (tracker.evidenceIds.length > 0) {
      await db.delete(evidenceFiles).where(inArray(evidenceFiles.id, tracker.evidenceIds));
    }
    if (tracker.workflowIds.length > 0) {
      await db.delete(approvalWorkflows).where(inArray(approvalWorkflows.id, tracker.workflowIds));
    }
    if (tracker.systemIds.length > 0) {
      await db.delete(systemControls).where(inArray(systemControls.systemId, tracker.systemIds));
      await db.delete(aiSystems).where(inArray(aiSystems.id, tracker.systemIds));
    }
    if (tracker.membershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, tracker.membershipIds));
    }
    if (tracker.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, tracker.userIds));
    }
    if (tracker.organizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, tracker.organizationIds));
    }
    if (tracker.complianceControlIds.length > 0) {
      await db.delete(complianceControls).where(inArray(complianceControls.id, tracker.complianceControlIds));
    }
  }
});
