import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiFetch, throwIfResponseNotOk } from "@/lib/api-client";

export {
  apiFetch,
  apiRequest,
  captureCsrfTokenFromResponse,
  clearCsrfToken,
  getCsrfToken,
} from "@/lib/api-client";

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await apiFetch(queryKey.join("/") as string);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResponseNotOk(res);
    return await res.json();
  };

export function withOrgQueryKey(baseKey: string, organizationId: string | null | undefined, ...rest: unknown[]) {
  return [baseKey, organizationId ?? "no-org", ...rest] as const;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
