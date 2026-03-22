import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiRequest, captureCsrfTokenFromResponse, queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/api-url";
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
const LOGOUT_MARKER_KEY = "ai-control-tower:last-logout-at";
const PUBLIC_SESSION_PATHS = new Set([
  "/",
  "/welcome",
  "/auth",
  "/auth/login",
  "/auth/reset-password",
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const syncAuthState = useCallback(async (redirectIfLoggedOut: boolean) => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const res = await fetch(resolveApiUrl("/api/auth/user"), { credentials: "include", cache: "no-store" });
      captureCsrfTokenFromResponse(res);

      if (res.status === 401) {
        queryClient.setQueryData(["/api/auth/user"], null);
        if (redirectIfLoggedOut && !PUBLIC_SESSION_PATHS.has(window.location.pathname)) {
          window.location.replace("/auth/login");
        }
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to refresh session");
      }

      const nextUser = (await res.json()) as AuthUser;
      queryClient.setQueryData(["/api/auth/user"], nextUser);
    } catch {
      queryClient.setQueryData(["/api/auth/user"], null);
      if (redirectIfLoggedOut && !PUBLIC_SESSION_PATHS.has(window.location.pathname)) {
        window.location.replace("/auth/login");
      }
    } finally {
      window.sessionStorage.removeItem(LOGOUT_MARKER_KEY);
    }
  }, []);

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/auth/user"), { credentials: "include", cache: "no-store" });
      captureCsrfTokenFromResponse(res);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      const loggedOut = Boolean(window.sessionStorage.getItem(LOGOUT_MARKER_KEY));
      if (event.persisted || loggedOut) {
        void syncAuthState(true);
      }
    };

    const handleVisibilityChange = () => {
      const loggedOut = Boolean(window.sessionStorage.getItem(LOGOUT_MARKER_KEY));
      if (document.visibilityState === "visible" && loggedOut) {
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
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      let res: Response;
      try {
        res = await fetch(resolveApiUrl("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
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
      captureCsrfTokenFromResponse(res);

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const error = new Error(payload?.message || "Login failed") as AuthMutationError;
        error.status = res.status;
        error.mfaRequired = Boolean(payload?.mfaRequired);
        throw error;
      }
      return payload as AuthUser;
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: `Welcome back, ${user.fullName}` });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterInput) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
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
      await apiRequest("POST", "/api/auth/switch-organization", { organizationId });
      const res = await fetch(resolveApiUrl("/api/auth/user"), { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Failed to refresh user after organization switch");
      return res.json();
    },
    onSuccess: async (nextUser: AuthUser) => {
      queryClient.setQueryData(["/api/auth/user"], nextUser);
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
    await apiRequest("POST", "/api/auth/logout");
    queryClient.setQueryData(["/api/auth/user"], null);
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(LOGOUT_MARKER_KEY, String(Date.now()));
      window.location.replace("/auth/login");
      return;
    }
    toast({ title: "Logged out successfully" });
  };

  const switchOrganization = async (organizationId: string) => {
    await switchOrganizationMutation.mutateAsync(organizationId);
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
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
