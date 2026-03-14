import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiRequest, captureCsrfTokenFromResponse, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginInput) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      let res: Response;
      try {
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
          signal: controller.signal,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          const timeoutError = new Error(
            "Sign-in timed out. If this is the hosted demo, the backend may be waking up. Wait 20-30 seconds and try again.",
          ) as AuthMutationError;
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
    onError: (err: AuthMutationError) => {
      if (err.mfaRequired) {
        toast({
          title: "MFA verification required",
          description: "Enter your authenticator code or a recovery code to continue.",
        });
        return;
      }
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
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
      const res = await fetch("/api/auth/user", { credentials: "include" });
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
