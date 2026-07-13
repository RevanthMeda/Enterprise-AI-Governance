import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  apiFetch,
  apiRequest,
  clearCsrfToken,
  queryClient,
  setSessionUnauthorizedHandler,
} from "@/lib/queryClient";
import { authUserQueryKey, clearOrganizationScopedQueries } from "@/lib/organization-query-cache";
import { useToast } from "@/hooks/use-toast";
import type {
  AccessibilityPreferenceState,
  DashboardViewId,
  DashboardWidgetId,
  NotificationPreferenceState,
  WorkspaceLocale,
} from "@shared/operator-preferences";

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
  isDefault: boolean;
}

export interface AuthOnboardingState {
  currentStep: number;
  completedSteps: string[];
  dismissedAlerts: string[];
  snoozedAlerts: Record<string, string>;
  dashboardView: DashboardViewId;
  dashboardWidgets: DashboardWidgetId[];
  notificationPreferences: NotificationPreferenceState;
  accessibilityPreferences: AccessibilityPreferenceState;
  workspaceLocale: WorkspaceLocale;
  guidedMode: boolean;
  updatedAt: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  mfaEnabled: boolean;
  currentOrganizationId: string | null;
  currentOrganizationOnboarding: AuthOnboardingState | null;
  organizations: AuthOrganization[];
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthTransitioning: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { username: string; password: string; fullName: string; email?: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  loginMutation: UseMutationResult<AuthUser, Error, LoginInput, unknown>;
  registerMutation: UseMutationResult<AuthUser, Error, RegisterInput, unknown>;
  switchOrganizationMutation: UseMutationResult<AuthUser, Error, string, unknown>;
}

type LoginInput = {
  username: string;
  password: string;
  mfaCode?: string;
  recoveryCode?: string;
};

type RegisterInput = {
  username: string;
  password: string;
  fullName: string;
  email?: string;
  role?: string;
};

const AuthContext = createContext<AuthContextType | null>(null);
type AuthMutationError = Error & { status?: number; mfaRequired?: boolean };
type AuthTransitionKind = "login" | "register" | "logout" | "switch-organization";
type AuthTransitionToken = { kind: AuthTransitionKind; id: symbol };
const LOGOUT_MARKER_KEY = "ai-control-grid:last-logout-at";
const PUBLIC_SESSION_PATHS = new Set([
  "/",
  "/welcome",
  "/acturus",
  "/arcturos",
  "/auth",
  "/auth/login",
  "/auth/reset-password",
  "/auth/sso/complete",
  "/login",
  "/reset-password",
  "/auth/invite",
  "/invite/accept",
  "/book-demo",
  "/start-pilot",
  "/thank-you",
  "/book-demo/thank-you",
  "/start-pilot/thank-you",
  "/privacy",
  "/terms",
  "/security",
  "/trust-center",
  "/api-docs",
]);

async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const res = await apiFetch("/api/auth/user", { cache: "no-store", signal });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to refresh session");
  }
  return (await res.json()) as AuthUser;
}

async function verifyAuthenticatedSession(): Promise<AuthUser> {
  const user = await fetchCurrentUser();
  if (!user) {
    const error = new Error(
      "Sign-in succeeded, but the browser did not retain the secure session. Allow cookies for this site or use the same-origin application address, then sign in again.",
    ) as AuthMutationError;
    error.status = 401;
    throw error;
  }
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const sessionSyncRef = useRef<Promise<void> | null>(null);
  const authTransitionRef = useRef<AuthTransitionToken | null>(null);
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);

  const acquireAuthTransition = useCallback((kind: AuthTransitionKind): AuthTransitionToken | null => {
    if (authTransitionRef.current) {
      return null;
    }
    const token = { kind, id: Symbol(kind) };
    authTransitionRef.current = token;
    setIsAuthTransitioning(true);
    return token;
  }, []);

  const releaseAuthTransition = useCallback((token: AuthTransitionToken): void => {
    if (authTransitionRef.current !== token) {
      return;
    }
    authTransitionRef.current = null;
    setIsAuthTransitioning(false);
  }, []);

  const clearClientSession = useCallback((
    redirectIfLoggedOut: boolean,
    authenticatedAtRequest?: boolean,
  ): boolean => {
    const hadAuthenticatedUser = authenticatedAtRequest
      ?? Boolean(queryClient.getQueryData<AuthUser>(["/api/auth/user"]));
    clearCsrfToken();
    queryClient.clear();
    queryClient.setQueryData(["/api/auth/user"], null);

    if (typeof window === "undefined") {
      return false;
    }

    const { pathname, search } = window.location;
    const shouldRedirect =
      redirectIfLoggedOut &&
      (!PUBLIC_SESSION_PATHS.has(pathname) || (pathname === "/" && hadAuthenticatedUser));
    if (!shouldRedirect) {
      return false;
    }

    const returnPath = `${pathname}${search}`;
    window.location.replace(
      `/auth/login?reason=session-expired&next=${encodeURIComponent(returnPath)}`,
    );
    return true;
  }, []);

  const syncAuthState = useCallback((redirectIfLoggedOut: boolean): Promise<void> => {
    if (typeof window === "undefined") {
      return Promise.resolve();
    }
    if (authTransitionRef.current) {
      return Promise.resolve();
    }
    if (sessionSyncRef.current) {
      return sessionSyncRef.current;
    }

    const hadAuthenticatedUser = Boolean(queryClient.getQueryData<AuthUser>(["/api/auth/user"]));
    const syncPromise = queryClient.fetchQuery<AuthUser | null>({
      queryKey: ["/api/auth/user"],
      queryFn: ({ signal }) => fetchCurrentUser(signal),
      staleTime: 0,
    })
      .then((nextUser) => {
        if (!nextUser) {
          clearClientSession(redirectIfLoggedOut, hadAuthenticatedUser);
          return;
        }
        queryClient.setQueryData(["/api/auth/user"], nextUser);
      })
      .catch(() => {
        // A transient network/backend failure must not erase a still-valid local session.
      })
      .finally(() => {
        window.sessionStorage.removeItem(LOGOUT_MARKER_KEY);
        if (sessionSyncRef.current === syncPromise) {
          sessionSyncRef.current = null;
        }
      });

    sessionSyncRef.current = syncPromise;
    return syncPromise;
  }, [clearClientSession]);

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    let redirecting = false;
    return setSessionUnauthorizedHandler(() => {
      if (
        authTransitionRef.current?.kind === "login"
        || authTransitionRef.current?.kind === "register"
        || authTransitionRef.current?.kind === "logout"
      ) {
        return;
      }
      if (redirecting) {
        return;
      }
      redirecting = clearClientSession(true);
    });
  }, [clearClientSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePageShow = () => {
      void syncAuthState(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncAuthState(true);
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncAuthState]);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginInput) => {
      const transition = acquireAuthTransition("login");
      if (!transition) {
        throw new Error("Another account action is already in progress. Please wait a moment.");
      }
      try {
        await queryClient.cancelQueries();
        await sessionSyncRef.current?.catch(() => undefined);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20000);
        let res: Response;
        try {
          res = await apiFetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            signal: controller.signal,
          });
        } catch (error) {
          if ((error as Error).name === "AbortError") {
            const timeoutError = new Error("Sign-in timed out. Wait a moment and try again.") as AuthMutationError;
            timeoutError.status = 504;
            throw timeoutError;
          }
          throw error;
        } finally {
          window.clearTimeout(timeout);
        }

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const error = new Error(payload?.message || "Login failed") as AuthMutationError;
          error.status = res.status;
          error.mfaRequired = Boolean(payload?.mfaRequired);
          throw error;
        }
        return await verifyAuthenticatedSession();
      } finally {
        releaseAuthTransition(transition);
      }
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: `Welcome back, ${user.fullName}` });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterInput) => {
      const transition = acquireAuthTransition("register");
      if (!transition) {
        throw new Error("Another account action is already in progress. Please wait a moment.");
      }
      try {
        await queryClient.cancelQueries();
        await sessionSyncRef.current?.catch(() => undefined);
        await apiRequest("POST", "/api/auth/register", data);
        return await verifyAuthenticatedSession();
      } finally {
        releaseAuthTransition(transition);
      }
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: `Welcome, ${user.fullName}` });
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  const switchOrganizationMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const transition = acquireAuthTransition("switch-organization");
      if (!transition) {
        throw new Error("Another account action is already in progress. Please wait a moment.");
      }
      try {
        await queryClient.cancelQueries();
        await sessionSyncRef.current?.catch(() => undefined);
        await apiRequest("POST", "/api/auth/switch-organization", { organizationId });
        return await verifyAuthenticatedSession();
      } finally {
        releaseAuthTransition(transition);
      }
    },
    onSuccess: async (nextUser: AuthUser) => {
      clearOrganizationScopedQueries(queryClient);
      queryClient.setQueryData(authUserQueryKey, nextUser);
      await queryClient.invalidateQueries();
      toast({ title: "Organization switched" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to switch organization", description: err.message, variant: "destructive" });
    },
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const register = async (data: RegisterInput) => {
    await registerMutation.mutateAsync(data);
  };

  const logout = async () => {
    const transition = acquireAuthTransition("logout");
    if (!transition) {
      toast({ title: "Please wait", description: "Another account action is already in progress." });
      return;
    }
    try {
      let response: Response;
      try {
        await queryClient.cancelQueries();
        await sessionSyncRef.current?.catch(() => undefined);
        response = await apiFetch("/api/auth/logout", { method: "POST" });
      } catch (error) {
        toast({
          title: "Logout failed",
          description: error instanceof Error ? error.message : "Could not reach the server. Please try again.",
          variant: "destructive",
        });
        return;
      }
      if (!response.ok && response.status !== 401) {
        const detail = (await response.text()) || response.statusText;
        toast({ title: "Logout failed", description: detail, variant: "destructive" });
        return;
      }

      clearClientSession(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(LOGOUT_MARKER_KEY, String(Date.now()));
        window.location.replace("/auth/login");
        return;
      }
      toast({ title: "Logged out successfully" });
    } finally {
      releaseAuthTransition(transition);
    }
  };

  const switchOrganization = async (organizationId: string) => {
    await switchOrganizationMutation.mutateAsync(organizationId);
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isAuthTransitioning,
        login,
        register,
        logout,
        switchOrganization,
        loginMutation,
        registerMutation,
        switchOrganizationMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
