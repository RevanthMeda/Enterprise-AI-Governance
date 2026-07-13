export const MFA_FAILURE_WINDOW_MS = 5 * 60_000;
export const MFA_LOCKOUT_MS = 5 * 60_000;
export const MFA_MAX_FAILURES = 5;

export function nextMfaFailureState(
  current: {
    failedAttempts: number;
    windowStartedAt: Date | null;
    lockedUntil: Date | null;
  },
  now: Date,
): {
  failedAttempts: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
} {
  if (current.lockedUntil && current.lockedUntil.getTime() > now.getTime()) {
    return {
      failedAttempts: current.failedAttempts,
      windowStartedAt: current.windowStartedAt ?? now,
      lockedUntil: current.lockedUntil,
    };
  }

  const withinWindow = Boolean(
    current.windowStartedAt &&
    now.getTime() - current.windowStartedAt.getTime() <= MFA_FAILURE_WINDOW_MS,
  );
  const failedAttempts = withinWindow ? current.failedAttempts + 1 : 1;
  return {
    failedAttempts,
    windowStartedAt: withinWindow ? current.windowStartedAt! : now,
    lockedUntil:
      failedAttempts >= MFA_MAX_FAILURES
        ? new Date(now.getTime() + MFA_LOCKOUT_MS)
        : null,
  };
}
