import { QueryClient, QueryFunction } from "@tanstack/react-query";

let csrfToken: string | null = null;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function getCsrfToken() {
  return csrfToken;
}

export function captureCsrfTokenFromResponse(res: Response) {
  const token = res.headers.get("x-csrf-token");
  if (token) {
    csrfToken = token;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const upperMethod = method.toUpperCase();
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  if (!SAFE_METHODS.has(upperMethod) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(url, {
    method: upperMethod,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  captureCsrfTokenFromResponse(res);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });
    captureCsrfTokenFromResponse(res);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
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
