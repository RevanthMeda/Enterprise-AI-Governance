import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const authUserQueryKey = ["/api/auth/user"] as const;

export function isAuthUserQueryKey(queryKey: QueryKey): boolean {
  return queryKey.length === authUserQueryKey.length && queryKey[0] === authUserQueryKey[0];
}

export function clearOrganizationScopedQueries(client: QueryClient): void {
  client.removeQueries({
    predicate: (query) => !isAuthUserQueryKey(query.queryKey),
  });
}
