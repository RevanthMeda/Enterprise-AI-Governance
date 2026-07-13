export const DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS = 5 * 60_000;
export const MIN_BACKGROUND_JOB_LEASE_TIMEOUT_MS = 30_000;

export type BackgroundJobAttemptState = {
  attempts: number;
  maxAttempts: number;
  runAt: Date;
};

export type BackgroundJobFailureTransition = {
  attempts: number;
  runAt: Date;
  status: "pending" | "failed";
};

export type BackgroundJobLeaseState = {
  lockedAt: Date | null;
  lockedBy: string | null;
};

export type BackgroundJobLease = {
  lockedAt: Date;
  lockedBy: string;
};

export function resolveBackgroundJobLeaseTimeoutMs(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS;
  }

  return Math.max(MIN_BACKGROUND_JOB_LEASE_TIMEOUT_MS, Math.trunc(parsed));
}

export function getBackgroundJobLeaseCutoff(now: Date, leaseTimeoutMs: number): Date {
  return new Date(now.getTime() - leaseTimeoutMs);
}

export function isBackgroundJobLeaseStale(
  lockedAt: Date | null,
  now: Date,
  leaseTimeoutMs: number,
): boolean {
  return lockedAt === null || lockedAt.getTime() <= getBackgroundJobLeaseCutoff(now, leaseTimeoutMs).getTime();
}

export function getBackgroundJobLease(job: BackgroundJobLeaseState): BackgroundJobLease | null {
  if (!job.lockedAt || !job.lockedBy) {
    return null;
  }

  return {
    lockedAt: job.lockedAt,
    lockedBy: job.lockedBy,
  };
}

export function getBackgroundJobRetryTime(attempts: number, now: Date): Date {
  const delayMs = Math.min(60_000, Math.max(5_000, attempts * 5_000));
  return new Date(now.getTime() + delayMs);
}

export function getBackgroundJobFailureTransition(
  job: BackgroundJobAttemptState,
  now: Date,
): BackgroundJobFailureTransition {
  const nextAttempts = job.attempts + 1;
  const canRetry = nextAttempts < job.maxAttempts;

  return {
    attempts: nextAttempts,
    runAt: canRetry ? getBackgroundJobRetryTime(nextAttempts, now) : job.runAt,
    status: canRetry ? "pending" : "failed",
  };
}
