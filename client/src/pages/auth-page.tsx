import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, LogIn, UserPlus } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";

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

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ssoOrgSlug, setSsoOrgSlug] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const { loginMutation, registerMutation } = useAuth();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", mfaCode: "", recoveryCode: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", username: "", password: "", role: "reviewer" },
  });

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
        },
        onError: (error: unknown) => {
          if ((error as { mfaRequired?: boolean })?.mfaRequired) {
            setMfaRequired(true);
          }
        },
      },
    );
  };

  const onRegister = (values: RegisterValues) => {
    registerMutation.mutate(values);
  };

  const startSsoLogin = () => {
    const orgSlug = ssoOrgSlug.trim();
    if (!orgSlug) return;
    const nextPath =
      typeof window === "undefined"
        ? "/"
        : new URLSearchParams(window.location.search).get("next") || "/";
    setSsoLoading(true);
    window.location.assign(
      `/api/auth/sso/start?org=${encodeURIComponent(orgSlug)}&next=${encodeURIComponent(nextPath)}`,
    );
  };

  return (
    <div className="min-h-screen flex" data-testid="page-auth">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {mode === "login" ? (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-lg flex items-center justify-center gap-2">
                  <LogIn className="h-5 w-5" />
                  Sign In
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Access the AI Control Tower platform
                </p>
              </CardHeader>
              <CardContent>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField control={loginForm.control} name="username" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Username</FormLabel>
                        <FormControl><Input {...field} data-testid="input-login-username" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={loginForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Password</FormLabel>
                        <FormControl><Input type="password" {...field} data-testid="input-login-password" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {mfaRequired && (
                      <>
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                          <p className="text-xs font-medium">MFA required</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Enter a 6-digit authenticator code or a recovery code.
                          </p>
                        </div>
                        <FormField control={loginForm.control} name="mfaCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Authenticator code</FormLabel>
                            <FormControl><Input {...field} placeholder="123456" data-testid="input-login-mfa-code" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={loginForm.control} name="recoveryCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Recovery code</FormLabel>
                            <FormControl><Input {...field} placeholder="Optional alternative" data-testid="input-login-recovery-code" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </>
                    )}
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </Form>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-medium">Sign in with SSO</p>
                  <Input
                    value={ssoOrgSlug}
                    onChange={(event) => setSsoOrgSlug(event.target.value)}
                    placeholder="organization slug (e.g. acme-corp)"
                    data-testid="input-sso-org-slug"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    disabled={ssoLoading || !ssoOrgSlug.trim()}
                    onClick={startSsoLogin}
                    data-testid="button-sso-start"
                  >
                    {ssoLoading ? "Redirecting..." : "Continue with SSO"}
                  </Button>
                </div>
                <div className="mt-4 text-center text-xs text-muted-foreground">
                  Account access is managed by your organization administrator.
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-lg flex items-center justify-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Create Account
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Join the AI governance platform
                </p>
              </CardHeader>
              <CardContent>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                    <FormField control={registerForm.control} name="fullName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Full Name</FormLabel>
                        <FormControl><Input {...field} data-testid="input-register-fullname" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Email</FormLabel>
                        <FormControl><Input type="email" {...field} data-testid="input-register-email" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={registerForm.control} name="username" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Username</FormLabel>
                          <FormControl><Input {...field} data-testid="input-register-username" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Password</FormLabel>
                          <FormControl><Input type="password" {...field} data-testid="input-register-password" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </Form>
                <div className="mt-4 text-center">
                  <span className="text-xs text-muted-foreground">Already have an account? </span>
                  <button
                    onClick={() => setMode("login")}
                    className="text-xs text-primary hover:underline"
                    data-testid="link-switch-login"
                  >
                    Sign in
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-primary/5 items-center justify-center p-12">
        <div className="max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
              <Shield className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">AI Control Tower</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Enterprise AI Governance Platform
            </p>
          </div>
          <div className="space-y-3 text-left">
            <div className="flex items-start gap-3 rounded-lg bg-background/60 p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">1</div>
              <div>
                <p className="text-xs font-medium">EU AI Act Compliance</p>
                <p className="text-[10px] text-muted-foreground">Full risk classification and control mapping</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-background/60 p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">2</div>
              <div>
                <p className="text-xs font-medium">NIST AI RMF & ISO 42001</p>
                <p className="text-[10px] text-muted-foreground">Multi-framework governance support</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-background/60 p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">3</div>
              <div>
                <p className="text-xs font-medium">Audit-Ready Evidence</p>
                <p className="text-[10px] text-muted-foreground">Export compliance reports for regulators</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
