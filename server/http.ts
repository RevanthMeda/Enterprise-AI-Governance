type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = 10_000, timeoutMessage, signal, ...requestInit } = init;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(input, { ...requestInit, signal });
  }

  const controller = new AbortController();
  const relayAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", relayAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    const isTimeoutAbort = controller.signal.aborted && !signal?.aborted;
    if (isTimeoutAbort) {
      throw new Error(timeoutMessage ?? `Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}
