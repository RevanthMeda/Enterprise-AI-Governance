import type { QueryClient } from "@tanstack/react-query";

export const runtimeSystemsQueryKey = ["/api/ai-systems", "runtime-monitoring"] as const;

export const runtimeEvaluationInvalidationKeys = [
  ["/api/telemetry/summary"],
  ["/api/incidents"],
  ["/api/incidents/summary"],
] as const;

export async function invalidateRuntimeEvaluationQueries(client: QueryClient): Promise<void> {
  await Promise.all(
    runtimeEvaluationInvalidationKeys.map((queryKey) => client.invalidateQueries({ queryKey, exact: true })),
  );
}
