import { useMemo, useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

export default function ResetPasswordPage() {
  const pageCopy = usePageCopy();
  const [, setLocation] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const token = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);

  const submit = async () => {
    if (!token) {
      setError("Password reset token is missing.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        token,
        newPassword,
      });
      setComplete(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eff6ff_0%,#ffffff_44%,#f8fafc_100%)] text-foreground">
      <PublicSiteHeader />
      <div className="mx-auto flex min-h-[calc(100vh-81px)] max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Card className="w-full max-w-lg border-border/70 bg-background/95 shadow-2xl shadow-slate-900/5" data-testid="page-reset-password">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <KeyRound className="h-5 w-5" />
              {pageCopy.resetPassword.title}
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              {pageCopy.resetPassword.description}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {complete ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700">
                  Password reset successful. You can now sign in with your new password.
                </div>
                <Button className="w-full rounded-xl" onClick={() => setLocation("/auth/login")} data-testid="button-reset-password-login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Return to sign in
                </Button>
              </div>
            ) : (
              <>
                {!token ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    Password reset token is missing or invalid. Request a new link from the sign-in page.
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New password</p>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Minimum 12 characters"
                    data-testid="input-reset-password-new"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confirm password</p>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter your password"
                    data-testid="input-reset-password-confirm"
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <Button
                  className="w-full rounded-xl"
                  onClick={submit}
                  disabled={isWorking || !token || !newPassword || !confirmPassword}
                  data-testid="button-reset-password-submit"
                >
                  {isWorking ? "Updating password..." : "Reset password"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
