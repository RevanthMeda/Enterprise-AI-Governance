import { randomUUID } from "crypto";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { backgroundJobs, type BackgroundJob, type InsertBackgroundJob } from "@shared/schema";
import { db } from "../db";
import { isVercelRuntime, parseBooleanEnv } from "../env";
import { fetchWithTimeout } from "../http";
import { deliverInvite, type InviteDeliveryResult } from "./inviteDeliveryService";

const POLL_MS = Number(process.env.BACKGROUND_JOB_POLL_MS || 5000);
const BATCH_SIZE = Math.max(1, Number(process.env.BACKGROUND_JOB_BATCH_SIZE || 5));
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
  url: string;
  token?: string | null;
  body: Record<string, unknown>;
}

function toRetryTime(attempts: number) {
  const delayMs = Math.min(60_000, Math.max(5_000, attempts * 5_000));
  return new Date(Date.now() + delayMs);
}

async function runInviteDelivery(payload: InviteDeliveryJobPayload): Promise<InviteDeliveryResult> {
  return deliverInvite({
    ...payload,
    expiresAt: new Date(payload.expiresAt),
  });
}

async function runMonitoringWebhook(payload: MonitoringWebhookJobPayload): Promise<{ delivered: true }> {
  const response = await fetchWithTimeout(payload.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(payload.token ? { Authorization: `Bearer ${payload.token}` } : {}),
    },
    body: JSON.stringify(payload.body),
    timeoutMs: MONITORING_WEBHOOK_TIMEOUT_MS,
    timeoutMessage: "Monitoring webhook timed out",
  });

  if (!response.ok) {
    throw new Error(`Monitoring webhook failed with ${response.status}`);
  }

  return { delivered: true };
}

async function processJob(job: BackgroundJob) {
  if (job.type === "invite_delivery") {
    return runInviteDelivery(job.payload as InviteDeliveryJobPayload);
  }

  if (job.type === "monitoring_webhook") {
    return runMonitoringWebhook(job.payload as MonitoringWebhookJobPayload);
  }

  throw new Error(`Unsupported background job type: ${job.type}`);
}

async function claimNextJobs(limit: number): Promise<BackgroundJob[]> {
  const candidates = await db
    .select()
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.status, "pending"), lte(backgroundJobs.runAt, new Date())))
    .orderBy(asc(backgroundJobs.runAt), asc(backgroundJobs.createdAt))
    .limit(limit);

  const claimed: BackgroundJob[] = [];

  for (const candidate of candidates) {
    const [job] = await db
      .update(backgroundJobs)
      .set({
        status: "processing",
        lockedAt: new Date(),
        lockedBy: workerId,
        updatedAt: new Date(),
      })
      .where(and(eq(backgroundJobs.id, candidate.id), eq(backgroundJobs.status, "pending")))
      .returning();

    if (job) {
      claimed.push(job);
    }
  }

  return claimed;
}

async function markSucceeded(jobId: string, result: unknown) {
  await db
    .update(backgroundJobs)
    .set({
      status: "succeeded",
      result,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, jobId));
}

async function markFailed(job: BackgroundJob, error: Error) {
  const nextAttempts = (job.attempts ?? 0) + 1;
  const canRetry = nextAttempts < (job.maxAttempts ?? 3);

  await db
    .update(backgroundJobs)
    .set({
      status: canRetry ? "pending" : "failed",
      attempts: nextAttempts,
      runAt: canRetry ? toRetryTime(nextAttempts) : job.runAt,
      lockedAt: null,
      lockedBy: null,
      lastError: error.message,
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, job.id));
}

class BackgroundJobService {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  async enqueue(job: Omit<InsertBackgroundJob, "result" | "attempts" | "status" | "runAt" | "lockedAt" | "lockedBy" | "lastError" | "updatedAt"> & { maxAttempts?: number; runAt?: Date }) {
    const [created] = await db
      .insert(backgroundJobs)
      .values({
        ...job,
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
      };
    }

    this.draining = true;
    let claimed = 0;
    let succeeded = 0;
    let failed = 0;
    try {
      const jobs = await claimNextJobs(BATCH_SIZE);
      claimed = jobs.length;
      for (const job of jobs) {
        try {
          const result = await processJob(job);
          await markSucceeded(job.id, result);
          succeeded += 1;
        } catch (error) {
          await markFailed(job, error instanceof Error ? error : new Error(String(error)));
          failed += 1;
        }
      }
      return {
        skipped: false,
        claimed,
        succeeded,
        failed,
      };
    } finally {
      this.draining = false;
    }
  }

  private async tick() {
    await this.runPendingOnce();
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
    const query = db
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

    return query;
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

    return {
      workerEnabled: isWorkerEnabled(),
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
