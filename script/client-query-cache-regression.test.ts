import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  authUserQueryKey,
  clearOrganizationScopedQueries,
} from "../client/src/lib/organization-query-cache";
import {
  invalidateRuntimeEvaluationQueries,
  runtimeEvaluationInvalidationKeys,
  runtimeSystemsQueryKey,
} from "../client/src/lib/runtime-query-cache";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
}

test("organization switch purge preserves auth and removes every organization-scoped cache entry", () => {
  const client = createClient();
  const authUser = { id: "user-1", currentOrganizationId: "org-a" };

  client.setQueryData(authUserQueryKey, authUser);
  client.setQueryData(["/api/incidents"], [{ id: "incident-a" }]);
  client.setQueryData(["/api/notifications"], [{ id: "notification-a" }]);
  client.setQueryData(runtimeSystemsQueryKey, [{ id: "system-a" }]);

  clearOrganizationScopedQueries(client);

  assert.deepEqual(client.getQueryData(authUserQueryKey), authUser);
  assert.equal(client.getQueryData(["/api/incidents"]), undefined);
  assert.equal(client.getQueryData(["/api/notifications"]), undefined);
  assert.equal(client.getQueryData(runtimeSystemsQueryKey), undefined);
});

test("organization-keyed workspace remount cannot observe removed organization data", () => {
  const client = createClient();
  const incidentsKey = ["/api/incidents"] as const;
  client.setQueryData(incidentsKey, [{ id: "incident-a" }]);

  const oldObserver = new QueryObserver(client, {
    queryKey: incidentsKey,
    queryFn: async () => [{ id: "incident-b" }],
    enabled: false,
  });
  const unsubscribe = oldObserver.subscribe(() => undefined);
  assert.deepEqual(oldObserver.getCurrentResult().data, [{ id: "incident-a" }]);

  clearOrganizationScopedQueries(client);
  unsubscribe();

  const remountedObserver = new QueryObserver(client, {
    queryKey: incidentsKey,
    queryFn: async () => [{ id: "incident-b" }],
    enabled: false,
  });
  assert.equal(remountedObserver.getCurrentResult().data, undefined);
});

test("AI-system root invalidation reaches the runtime systems query", async () => {
  const client = createClient();
  client.setQueryData(runtimeSystemsQueryKey, [{ id: "system-a" }]);

  await client.invalidateQueries({ queryKey: ["/api/ai-systems"], refetchType: "none" });

  assert.equal(client.getQueryState(runtimeSystemsQueryKey)?.isInvalidated, true);
});

test("successful runtime evaluation invalidates telemetry and incident views only", async () => {
  const client = createClient();
  for (const queryKey of runtimeEvaluationInvalidationKeys) {
    client.setQueryData(queryKey, { seeded: true });
  }
  const unrelatedKey = ["/api/organization/telemetry-adapter"] as const;
  client.setQueryData(unrelatedKey, { enabled: true });

  await invalidateRuntimeEvaluationQueries(client);

  for (const queryKey of runtimeEvaluationInvalidationKeys) {
    assert.equal(client.getQueryState(queryKey)?.isInvalidated, true);
  }
  assert.equal(client.getQueryState(unrelatedKey)?.isInvalidated, false);
});

test("organization and runtime cache protections are wired into the frontend", async () => {
  const [appSource, authSource, runtimeSource, adapterSource] = await Promise.all([
    readFile("client/src/App.tsx", "utf8"),
    readFile("client/src/hooks/use-auth.tsx", "utf8"),
    readFile("client/src/pages/runtime-monitoring.tsx", "utf8"),
    readFile("client/src/pages/telemetry-adapter.tsx", "utf8"),
  ]);

  assert.match(appSource, /<SidebarProvider key=\{user\.currentOrganizationId \?\? "no-organization"\}/);

  const clearIndex = authSource.indexOf("clearOrganizationScopedQueries(queryClient)");
  const publishIndex = authSource.indexOf("queryClient.setQueryData(authUserQueryKey, nextUser)");
  assert.ok(clearIndex >= 0, "organization switch must purge old organization query data");
  assert.ok(publishIndex > clearIndex, "old organization query data must be purged before publishing the new auth state");

  assert.match(runtimeSource, /queryKey: runtimeSystemsQueryKey/);
  assert.match(runtimeSource, /isRuntimeEvaluationTargetAvailable\(selectedSystemId, availableSystemIds\)/);
  assert.match(runtimeSource, /invalidateRuntimeEvaluationQueries\(queryClient\)/);
  assert.match(adapterSource, /if \(result\.ok\) \{\s*void invalidateRuntimeEvaluationQueries\(queryClient\);/);
});
