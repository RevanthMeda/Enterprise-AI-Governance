import { randomUUID } from "crypto";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { backgroundJobs, type BackgroundJob, type InsertBackgroundJob } from "@shared/schema";
import { db } from "../db";
import { isVercelRuntime, parseBooleanEnv } from "../env";
import { safeOutboundFetch } from "../safe-outbound-http";
import {
  deliverInvite,
  isInviteDeliverySuccessful,
  type InviteDeliveryResult,
} from "./inviteDeliveryService";
import {
  getBackgroundJobFailureTransition,
  getBackgroundJobLease,
  getBackgroundJobLeaseCutoff,
  resolveBackgroundJobLeaseTimeoutMs,
} from "./backgroundJobState";
import {
  backgroundJobClientView,
  isEncryptedBackgroundJobPayload,
  protectBackgroundJobPayload,
  resolveBackgroundJobPayload,
} from "./backgroundJobPayloadSecurity";
import { integrationConnectorService } from "./integrationConnectorService";

const configuredPollMs = Number(process.env.BACKGROUND_JOB_POLL_MS || 5000);
const POLL_MS = Number.isFinite(configuredPollMs) ? Math.max(1_000, configuredPollMs) : 5_000;
const BATCH_SIZE = Math.max(1, Number(process.env.BACKGROUND_JOB_BATCH_SIZE || 5));
const LEASE_TIMEOUT_MS = resolveBackgroundJobLeaseTimeoutMs(process.env.BACKGROUND_JOB_LEASE_TIMEOUT_MS);
const MONITORING_WEBHOOK_TIMEOUT_MS = 2500;
const workerId = `${process.env.MONITORING_SERVICE_NAME || "ai-control-grid"}-${process.pid}-${randomUUID().slice(0, 8)}`;

function isWorkerEnabled() {
  return !parseBooleanEnv(process.env.BACKGROUND_JOBS_DISABLED, false) && !isVercelRuntime();
}

interface InviteDeliveryJobPayload {
  email: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
  invitedByName?: string | null;
  mode: "created" | "resent";
}

interface MonitoringWebhookJobPayload {
  url?: string;
  token?: string | null;
  destination?:
    | { kind: "monitoring_environment" }
    | { kind: "governance_environment" }
    | { kind: "organization_connector"; connectorId: string };
  body: Record<string, unknown>;
}

async function runInviteDelivery(payload: InviteDeliveryJobPayload): Promise<InviteDeliveryResult> {
  const result = await deliverInvite({
    ...payload,
    expiresAt: new Date(payload.expiresAt),
  });
  if (!isInviteDeliverySuccessful(result)) {
    throw new Error(`Invite delivery failed via ${result.channel}`);
  }
  return result;
}

async function resolveMonitoringDestination(
  job: BackgroundJob,
  payload: MonitoringWebhookJobPayload,
): Promise<{ url: string; token: string | null }> {
  if (payload.destination?.kind === "monitoring_environment") {
    const url = process.env.MONITORING_WEBHOOK_URL?.trim();
    if (!url) throw new Error("Monitoring webhook destination is not configured");
    return { url, token: process.env.MONITORING_WEBHOOK_TOKEN?.trim() || null };
  }
  if (payload.destination?.kind === "governance_environment") {
    const url = process.env.GOVERNANCE_EVENT_WEBHOOK_URL?.trim();
    if (!url) throw new Error("Governance webhook destination is not configured");
    return { url, token: process.env.GOVERNANCE_EVENT_WEBHOOK_TOKEN?.trim() || null };
  }
  if (payload.destination?.kind === "organization_connector") {
    if (!job.organizationId) throw new Error("Connector job has no organization scope");
    const connectorId = payload.destination.connectorId;
    const connectors = await integrationConnectorService.getResolvedForOrg(job.organizationId);
    const connector = connectors.find(
      (candidate) =>
        candidate.id === connectorId &&
        candidate.enabled &&
        candidate.webhookUrl,
    );
    if (!connector?.webhookUrl) throw new Error("Connector destination is no longer available");
    return { url: connector.webhookUrl, token: connector.authToken ?? null };
  }

  // Compatibility for jobs queued by an older release. New jobs store only a
  // credential reference, and the whole legacy payload is encrypted at rest
  // before it is processed.
  if (!payload.url) throw new Error("Monitoring webhook destination is missing");
  return { url: payload.url, token: payload.token ?? null };
}

async function runMonitoringWebhook(
  job: BackgroundJob,
  payload: MonitoringWebhookJobPayload,
): Promise<{ delivered: true }> {
  const destination = await resolveMonitoringDestination(job, payload);
  const response = await safeOutboundFetch(destination.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(destination.token ? { Authorization: `Bearer ${destination.token}` } : {}),
    },
    body: JSON.stringify(payload.body),
    timeoutMs: MONITORING_WEBHOOK_TIMEOUT_MS,
    maxResponseBytes: 64 * 1024,
  });

  if (!response.ok) {
    throw new Error(`Monitoring webhook failed with ${response.status}`);
  }

  return { delivered: true };
}

async function processJob(job: BackgroundJob) {
  const payload = resolveBackgroundJobPayload(job.id, job.payload);
  if (job.type === "invite_delivery") {
    return runInviteDelivery(payload as InviteDeliveryJobPayload);
  }

  if (job.type === "monitoring_webhook") {
    return runMonitoringWebhook(job, payload as MonitoringWebhookJobPayload);
  }

  throw new Error(`Unsupported background job type: ${job.type}`);
}

async function claimNextJobs(limit: number, now = new Date()): Promise<BackgroundJob[]> {
  const candidates = await db
    .select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.status, "pending"), lte(backgroundJobs.runAt, now)))
    .orderBy(asc(backgroundJobs.runAt), asc(backgroundJobs.createdAt))
    .limit(limit);

  const claimed: BackgroundJob[] = [];

  for (const candidate of candidates) {
    const [job] = await db
      .update(backgroundJobs)
      .set({
        status: "processing",
        lockedAt: now,
        lockedBy: workerId,
        updatedAt: now,
      })
      .where(
        and(
          eq(backgroundJobs.id, candidate.id),
          eq(backgroundJobs.status, "pending"),
          lte(backgroundJobs.runAt, now),
        ),
      )
      .returning();

    if (job) {
      claimed.push(job);
    }
  }

  return claimed;
}

export async function reclaimStaleBackgroundJobs(
  limit: number,
  options: { leaseTimeoutMs?: number; now?: Date } = {},
): Promise<{ failed: number; requeued: number }> {
  const now = options.now ?? new Date();
  const leaseTimeoutMs = options.leaseTimeoutMs ?? LEASE_TIMEOUT_MS;
  const cutoff = getBackgroundJobLeaseCutoff(now, leaseTimeoutMs);
  const candidates = await db
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.status, "processing"),
        or(isNull(backgroundJobs.lockedAt), lte(backgroundJobs.lockedAt, cutoff)),
      ),
    )
    .orderBy(asc(backgroundJobs.lockedAt), asc(backgroundJobs.createdAt))
    .limit(limit);

  let failed = 0;
  let requeued = 0;

  for (const candidate of candidates) {
    const transition = getBackgroundJobFailureTransition(candidate, now);
    const [updated] = await db
      .update(backgroundJobs)
      .set({
        status: transition.status,
        attempts: transition.attempts,
        runAt: transition.runAt,
        lockedAt: null,
        lockedBy: null,
        lastError: `Processing lease expired after ${leaseTimeoutMs}ms`,
        updatedAt: now,
      })
      .where(
        and(
          eq(backgroundJobs.id, candidate.id),
          eq(backgroundJobs.status, "processing"),
          candidate.lockedAt === null
            ? isNull(backgroundJobs.lockedAt)
            : eq(backgroundJobs.lockedAt, candidate.lockedAt),
          candidate.lockedBy === null
            ? isNull(backgroundJobs.lockedBy)
            : eq(backgroundJobs.lockedBy, candidate.lockedBy),
        ),
      )
      .returning({ status: backgroundJobs.status });

    if (updated?.status === "pending") {
      requeued += 1;
    } else if (updated?.status === "failed") {
      failed += 1;
    }
  }

  return { failed, requeued };
}

async function protectLegacyBackgroundJobPayloads(limit: number): Promise<number> {
  if (!process.env.CONTROL_TOWER_VAULT_SECRET?.trim()) return 0;

  const candidates = await db
    .select()
    .from(backgroundJobs)
    .where(sql`not (${backgroundJobs.payload} ? 'encryptedPayload')`)
    .orderBy(asc(backgroundJobs.createdAt))
    .limit(limit);
  let protectedCount = 0;
  for (const candidate of candidates) {
    if (isEncryptedBackgroundJobPayload(candidate.payload)) continue;
    const [updated] = await db
      .update(backgroundJobs)
      .set({
        payload: protectBackgroundJobPayload(candidate.id, candidate.payload),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, candidate.id))
      .returning({ id: backgroundJobs.id });
    if (updated) protectedCount += 1;
  }
  return protectedCount;
}

export async function markBackgroundJobSucceeded(job: BackgroundJob, result: unknown): Promise<boolean> {
  const lease = getBackgroundJobLease(job);
  if (!lease) {
    return false;
  }

  const [updated] = await db
    .update(backgroundJobs)
    .set({
      status: "succeeded",
      result,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundJobs.id, job.id),
        eq(backgroundJobs.status, "processing"),
        eq(backgroundJobs.lockedBy, lease.lockedBy),
        eq(backgroundJobs.lockedAt, lease.lockedAt),
      ),
    )
    .returning({ id: backgroundJobs.id });

  return Boolean(updated);
}

async function renewBackgroundJobLease(job: BackgroundJob, now = new Date()): Promise<BackgroundJob | null> {
  const lease = getBackgroundJobLease(job);
  if (!lease) {
    return null;
  }

  const [renewed] = await db
    .update(backgroundJobs)
    .set({
      lockedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(backgroundJobs.id, job.id),
        eq(backgroundJobs.status, "processing"),
        eq(backgroundJobs.lockedBy, lease.lockedBy),
        eq(backgroundJobs.lockedAt, lease.lockedAt),
      ),
    )
    .returning();

  return renewed ?? null;
}

export async function markBackgroundJobFailed(
  job: BackgroundJob,
  error: Error,
  now = new Date(),
): Promise<boolean> {
  const lease = getBackgroundJobLease(job);
  if (!lease) {
    return false;
  }

  const transition = getBackgroundJobFailureTransition(job, now);
  const [updated] = await db
    .update(backgroundJobs)
    .set({
      status: transition.status,
      attempts: transition.attempts,
      runAt: transition.runAt,
      lockedAt: null,
      lockedBy: null,
      lastError: error.message,
      updatedAt: now,
    })
    .where(
      and(
        eq(backgroundJobs.id, job.id),
        eq(backgroundJobs.status, "processing"),
        eq(backgroundJobs.lockedBy, lease.lockedBy),
        eq(backgroundJobs.lockedAt, lease.lockedAt),
      ),
    )
    .returning({ id: backgroundJobs.id });

  return Boolean(updated);
}

class BackgroundJobService {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private lastSuccessfulRunAt: Date | null = null;
  private lastFailedRunAt: Date | null = null;

  async enqueue(job: Omit<InsertBackgroundJob, "result" | "attempts" | "status" | "runAt" | "lockedAt" | "lockedBy" | "lastError" | "updatedAt"> & { maxAttempts?: number; runAt?: Date }) {
    const id = randomUUID();
    const storedPayload = process.env.CONTROL_TOWER_VAULT_SECRET?.trim()
      ? protectBackgroundJobPayload(id, job.payload)
      : job.payload;
    const [created] = await db
      .insert(backgroundJobs)
      .values({
        ...job,
        id,
        payload: storedPayload,
        status: "pending",
        attempts: 0,
        result: {},
        maxAttempts: job.maxAttempts ?? 3,
        runAt: job.runAt ?? new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  start() {
    if (!isWorkerEnabled() || this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);

    this.timer.unref?.();
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runPendingOnce() {
    if (this.draining) {
      return {
        skipped: true,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        recovered: 0,
        recoveryFailed: 0,
        leaseLost: 0,
      };
    }

    this.draining = true;
    let claimed = 0;
    let succeeded = 0;
    let failed = 0;
    let recovered = 0;
    let recoveryFailed = 0;
    let leaseLost = 0;
    try {
      await protectLegacyBackgroundJobPayloads(BATCH_SIZE * 20);
      const recovery = await reclaimStaleBackgroundJobs(BATCH_SIZE);
      recovered = recovery.requeued;
      recoveryFailed = recovery.failed;
      const jobs = await claimNextJobs(BATCH_SIZE);
      claimed = jobs.length;
      for (const claimedJob of jobs) {
        const job = await renewBackgroundJobLease(claimedJob);
        if (!job) {
          leaseLost += 1;
          continue;
        }

        try {
          const result = await processJob(job);
          if (await markBackgroundJobSucceeded(job, result)) {
            succeeded += 1;
          } else {
            leaseLost += 1;
          }
        } catch (error) {
          if (await markBackgroundJobFailed(job, error instanceof Error ? error : new Error(String(error)))) {
            failed += 1;
          } else {
            leaseLost += 1;
          }
        }
      }
      return {
        skipped: false,
        claimed,
        succeeded,
        failed,
        recovered,
        recoveryFailed,
        leaseLost,
      };
    } finally {
      this.draining = false;
    }
  }

  private async tick() {
    try {
      await this.runPendingOnce();
      this.lastSuccessfulRunAt = new Date();
      this.lastFailedRunAt = null;
    } catch (error) {
      this.lastFailedRunAt = new Date();
      console.error("Background job worker tick failed", error);
    }
  }

  async getRecentFailures(limit = 20) {
    return db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.status, "failed"))
      .orderBy(desc(backgroundJobs.updatedAt))
      .limit(limit);
  }

  async getJobsForOrganization(params: {
    organizationId: string;
    status?: BackgroundJob["status"];
    limit?: number;
  }) {
    const rows = await db
      .select()
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.organizationId, params.organizationId),
          params.status ? eq(backgroundJobs.status, params.status) : undefined,
        ),
      )
      .orderBy(desc(backgroundJobs.updatedAt))
      .limit(Math.min(50, Math.max(1, params.limit ?? 10)));

    return rows.map(backgroundJobClientView);
  }

  async getJobSummaryForOrganization(organizationId: string) {
    const rows = await db
      .select({
        status: backgroundJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(backgroundJobs)
      .where(eq(backgroundJobs.organizationId, organizationId))
      .groupBy(backgroundJobs.status);

    return {
      pending: rows.find((row) => row.status === "pending")?.count ?? 0,
      processing: rows.find((row) => row.status === "processing")?.count ?? 0,
      succeeded: rows.find((row) => row.status === "succeeded")?.count ?? 0,
      failed: rows.find((row) => row.status === "failed")?.count ?? 0,
    };
  }

  async getGlobalSummary() {
    const rows = await db
      .select({
        status: backgroundJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(backgroundJobs)
      .groupBy(backgroundJobs.status);

    const workerEnabled = isWorkerEnabled();
    const workerRunning = this.timer !== null;
    const healthStaleAfterMs = Math.max(POLL_MS * 3, 30_000);
    const lastSuccessAgeMs = this.lastSuccessfulRunAt
      ? Date.now() - this.lastSuccessfulRunAt.getTime()
      : null;
    const workerHealthy = Boolean(
      workerEnabled &&
      workerRunning &&
      lastSuccessAgeMs !== null &&
      lastSuccessAgeMs <= healthStaleAfterMs &&
      (!this.lastFailedRunAt || this.lastSuccessfulRunAt! >= this.lastFailedRunAt),
    );

    return {
      workerEnabled,
      workerRunning,
      workerHealthy,
      draining: this.draining,
      lastSuccessfulRunAt: this.lastSuccessfulRunAt?.toISOString() ?? null,
      lastFailedRunAt: this.lastFailedRunAt?.toISOString() ?? null,
      healthStaleAfterMs,
      pending: rows.find((row) => row.status === "pending")?.count ?? 0,
      processing: rows.find((row) => row.status === "processing")?.count ?? 0,
      succeeded: rows.find((row) => row.status === "succeeded")?.count ?? 0,
      failed: rows.find((row) => row.status === "failed")?.count ?? 0,
    };
  }

  async retryFailedJobForOrganization(organizationId: string, jobId: string) {
    const [job] = await db
      .update(backgroundJobs)
      .set({
        status: "pending",
        attempts: 0,
        runAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        result: {},
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(backgroundJobs.id, jobId),
          eq(backgroundJobs.organizationId, organizationId),
          eq(backgroundJobs.status, "failed"),
        ),
      )
      .returning();

    return job;
  }
}

export const backgroundJobService = new BackgroundJobService();
