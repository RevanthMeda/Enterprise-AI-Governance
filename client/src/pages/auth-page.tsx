import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Fingerprint, KeyRound, LogIn, Shield, UserPlus, Workflow } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { resolveApiUrl } from "@/lib/api-url";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  mfaCode: z.string().optional(),
  recoveryCode: z.string().optional(),
});

const registerSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  role: z.string().default("reviewer"),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

const featureHighlights = [
  {
    title: "Enterprise identity built in",
    body: "Use local auth, SAML, OIDC, verified domains, and invite-based onboarding from one admin surface.",
    icon: Shield,
  },
  {
    title: "Operator-grade governance",
    body: "Decision traceability, approvals, evidence, and incident workflows stay linked instead of fragmenting across tools.",
    icon: Workflow,
  },
  {
    title: "Buyer-ready audit posture",
    body: "Immutable audit chains, exit-readiness metrics, and retention controls support enterprise diligence and portfolio oversight.",
    icon: Fingerprint,
  },
];

export default function AuthPage() {
  const pageCopy = usePageCopy();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetRequestLoading, setResetRequestLoading] = useState(false);
  const [resetRequestSent, setResetRequestSent] = useState(false);
  const [resetPreviewUrl, setResetPreviewUrl] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [ssoOrgSlug, setSsoOrgSlug] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { loginMutation, registerMutation } = useAuth();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", mfaCode: "", recoveryCode: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", username: "", password: "", role: "reviewer" },
  });

  const getNextPath = (fallback: string) => {
    if (typeof window === "undefined") {
      return fallback;
    }
    return new URLSearchParams(window.location.search).get("next") || fallback;
  };

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setMfaRequired(false);
    setRecoveryMode(false);
    setResetIdentifier("");
    setResetRequestSent(false);
    setResetPreviewUrl(null);
    setResetError(null);
    setSsoError(null);
  };

  const onLogin = (values: LoginValues) => {
    loginMutation.mutate(
      {
        ...values,
        mfaCode: values.mfaCode?.trim() || undefined,
        recoveryCode: values.recoveryCode?.trim() || undefined,
      },
      {
        onSuccess: () => {
          setMfaRequired(false);
          setRecoveryMode(false);
          setLocation(getNextPath("/dashboard"));
        },
        onError: (error: unknown) => {
          if ((error as { mfaRequired?: boolean })?.mfaRequired) {
            setMfaRequired(true);
            return;
          }
          if ((error as { message?: string })?.message?.includes("Password expired")) {
            setRecoveryMode(true);
            setResetIdentifier(loginForm.getValues("username"));
          }
        },
      },
    );
  };

  const onRegister = (values: RegisterValues) => {
    registerMutation.mutate(values, {
      onSuccess: () => {
        setLocation("/dashboard");
      },
    });
  };

  const loginErrorMessage = useMemo(() => {
    if (mfaRequired) {
      return null;
    }
    return loginMutation.error?.message ?? null;
  }, [loginMutation.error, mfaRequired]);

  const startSsoLogin = () => {
    const orgSlug = ssoOrgSlug.trim();
    if (!orgSlug) {
      setSsoError("Enter your organization slug to continue with SSO.");
      return;
    }

    setSsoError(null);
    setSsoLoading(true);
    window.location.assign(
      resolveApiUrl(
        `/api/auth/sso/start?org=${encodeURIComponent(orgSlug)}&next=${encodeURIComponent(getNextPath("/dashboard"))}`,
      ),
    );
  };

  const requestPasswordReset = async () => {
    const identifier = resetIdentifier.trim() || loginForm.getValues("username").trim();
    if (!identifier) {
      setResetError("Enter your username or email to request a reset link.");
      return;
    }

    setResetRequestLoading(true);
    setResetError(null);
    setResetRequestSent(false);
    setResetPreviewUrl(null);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { identifier });
      const body = await res.json();
      setResetIdentifier(identifier);
      setResetRequestSent(true);
      setResetPreviewUrl(body.previewUrl ?? null);
    } catch (error: any) {
      setResetError(error.message);
    } finally {
      setResetRequestLoading(false);
    }
  };

  const submitLabel = mfaRequired
    ? recoveryMode
      ? "Verify with recovery code"
      : "Verify sign in"
    : "Sign In";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eff6ff_0%,#ffffff_44%,#f8fafc_100%)] text-foreground" data-testid="page-auth">
      <PublicSiteHeader />
      <div className="mx-auto grid min-h-[calc(100vh-81px)] w-full max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-12">
        <section className="hidden flex-col justify-between rounded-[28px] border border-border/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96))] p-8 text-slate-50 shadow-2xl shadow-slate-900/10 lg:flex">
          <div className="space-y-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-200">
              <Building2 className="h-3.5 w-3.5" />
              Enterprise access
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white">
                {pageCopy.auth.title}
              </h1>
              <p className="max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                {pageCopy.auth.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {featureHighlights.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/12 bg-white/6 p-5 backdrop-blur-sm">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                  <item.icon className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-center">
          <Card className="w-full max-w-xl border-border/70 bg-background/95 shadow-2xl shadow-slate-900/5">
            <CardHeader className="space-y-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-full border border-border bg-muted/30 p-1">
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => switchMode("login")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => switchMode("register")}
                  >
                    Request access
                  </button>
                </div>
              </div>

              {mode === "login" ? (
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <LogIn className="h-5 w-5" />
                    Sign in to AI CONTROL GRID
                  </CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Use your organization account to access approvals, evidence, telemetry, and governance operations.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <UserPlus className="h-5 w-5" />
                    Create a local account
                  </CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Register a local user for evaluation or internal testing. Enterprise teams should usually use invite-based onboarding or SSO.
                  </p>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-6">
              {mode === "login" ? (
                <>
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={loginForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Username or email</FormLabel>
                              <FormControl>
                                <Input {...field} autoComplete="username" data-testid="input-login-username" placeholder="you@company.com" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={loginForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Password</FormLabel>
                              <FormControl>
                                <Input type="password" autoComplete="current-password" {...field} data-testid="input-login-password" placeholder="Enter your password" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {mfaRequired ? (
                        <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-foreground">Multi-factor verification required</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Use your authenticator app or switch to a recovery code if your device is unavailable.
                              </p>
                            </div>
                            <KeyRound className="mt-0.5 h-4 w-4 text-primary" />
                          </div>

                          <FormField
                            control={loginForm.control}
                            name="mfaCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Authenticator code</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="Enter 6-digit code"
                                    data-testid="input-login-mfa-code"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="rounded-xl border border-border/70 bg-background/80 p-4 text-[12px] text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <p>Lost access to your authenticator?</p>
                              <button
                                type="button"
                                className="font-medium text-primary hover:underline"
                                onClick={() => setRecoveryMode((current) => !current)}
                              >
                                {recoveryMode ? "Hide recovery code" : "Use recovery code"}
                              </button>
                            </div>
                            {recoveryMode ? (
                              <div className="mt-3 space-y-2">
                                <p>Enter one of your saved recovery codes below. If you do not have one, contact your organization administrator.</p>
                                <FormField
                                  control={loginForm.control}
                                  name="recoveryCode"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Recovery code</FormLabel>
                                      <FormControl>
                                        <Input {...field} placeholder="Use a saved recovery code" data-testid="input-login-recovery-code" />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {loginErrorMessage ? (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          {loginErrorMessage}
                        </div>
                      ) : null}

                      <Button type="submit" className="w-full rounded-xl" disabled={loginMutation.isPending} data-testid="button-login">
                        {loginMutation.isPending ? "Signing in..." : submitLabel}
                      </Button>

                      <div className="flex items-center justify-start gap-3 text-xs text-muted-foreground">
                        <button
                          type="button"
                          className="transition-colors hover:text-foreground hover:underline"
                          onClick={() => {
                            setRecoveryMode(true);
                            setResetIdentifier((current) => current || loginForm.getValues("username"));
                          }}
                        >
                          Forgot password?
                        </button>
                      </div>

                      {recoveryMode && !mfaRequired ? (
                        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-[12px] leading-5 text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground">Account recovery</p>
                            <p className="mt-1">
                              Local accounts can request a reset link here. SSO-managed identities should be reset with the external identity provider.
                            </p>
                          </div>
                          <Input
                            value={resetIdentifier}
                            onChange={(event) => {
                              setResetIdentifier(event.target.value);
                              if (resetError) {
                                setResetError(null);
                              }
                            }}
                            placeholder="Username or email"
                            data-testid="input-forgot-password-identifier"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={requestPasswordReset}
                            disabled={resetRequestLoading}
                            data-testid="button-forgot-password-submit"
                          >
                            {resetRequestLoading ? "Sending reset link..." : "Send reset link"}
                          </Button>
                          {resetRequestSent ? (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-700">
                              If an eligible local account exists, a password reset link has been sent.
                              {resetPreviewUrl ? (
                                <div className="mt-2">
                                  <a className="font-medium underline" href={resetPreviewUrl}>
                                    Open reset link
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {resetError ? (
                            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                              {resetError}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </form>
                  </Form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/70" />
                    </div>
                    <div className="relative flex justify-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      <span className="bg-background px-3">or continue with SSO</span>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">Organization single sign-on</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Enter your organization slug to start the SAML or OIDC flow configured by your admin team.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Input
                        value={ssoOrgSlug}
                        onChange={(event) => {
                          setSsoOrgSlug(event.target.value);
                          if (ssoError) {
                            setSsoError(null);
                          }
                        }}
                        placeholder="organization slug"
                        disabled={ssoLoading}
                        data-testid="input-sso-org-slug"
                      />
                      <Button type="button" variant="outline" className="sm:min-w-[190px]" onClick={startSsoLogin} disabled={ssoLoading} data-testid="button-sso-login">
                        {ssoLoading ? "Redirecting..." : "Continue with SSO"}
                      </Button>
                    </div>
                    {ssoError ? <p className="text-xs text-destructive">{ssoError}</p> : null}
                  </div>
                </>
              ) : (
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={registerForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Full name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Jane Doe" data-testid="input-register-fullname" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Work email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="jane@company.com" data-testid="input-register-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Username</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="jane.doe" data-testid="input-register-username" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Password</FormLabel>
                            <FormControl>
                              <Input {...field} type="password" placeholder="Minimum 12 characters" data-testid="input-register-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
                      Local registration is best suited for demos, internal evaluation, or test environments. Production tenant onboarding should use invites or SSO where possible.
                    </div>

                    <Button type="submit" className="w-full rounded-xl" disabled={registerMutation.isPending} data-testid="button-register">
                      {registerMutation.isPending ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
