import { resolveApiUrl } from "./api-url";

interface ClientErrorPayload {
  event: string;
  message: string;
  route: string;
  requestId?: string | null;
  stack?: string | null;
  metadata?: Record<string, unknown> | null;
}

const MAX_SEEN_EVENTS = 20;
const seenEvents = new Set<string>();
let lastRequestId: string | null = null;

function rememberEvent(key: string) {
  if (seenEvents.size >= MAX_SEEN_EVENTS) {
    const first = seenEvents.values().next().value;
    if (first) {
      seenEvents.delete(first);
    }
  }
  seenEvents.add(key);
}

function shouldSkip(key: string) {
  if (seenEvents.has(key)) {
    return true;
  }
  rememberEvent(key);
  return false;
}

function postClientError(payload: ClientErrorPayload) {
  const body = JSON.stringify({
    ...payload,
    route: window.location.pathname,
    requestId: payload.requestId ?? lastRequestId,
    metadata: {
      userAgent: navigator.userAgent,
      href: window.location.href,
      ...(payload.metadata ?? {}),
    },
  });

  const url = resolveApiUrl("/api/monitoring/client-errors");

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
}

export function setLatestRequestId(requestId: string | null | undefined) {
  if (requestId) {
    lastRequestId = requestId;
  }
}

export function installGlobalErrorReporting() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("error", (event) => {
    const key = [event.message, event.filename, event.lineno, event.colno].join("|");
    if (shouldSkip(key)) {
      return;
    }

    postClientError({
      event: "window.error",
      message: event.message || "Unhandled browser error",
      route: window.location.pathname,
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
      metadata: {
        filename: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack ?? null : null;
    const key = [message, stack].join("|");
    if (shouldSkip(key)) {
      return;
    }

    postClientError({
      event: "window.unhandledrejection",
      message,
      route: window.location.pathname,
      stack,
      metadata: {
        type: typeof reason,
      },
    });
  });
}
