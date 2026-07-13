import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { normalizeInternalPath } from "@shared/internal-path";
import { PublicSiteHeader } from "@/components/public-site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, clearCsrfToken } from "@/lib/queryClient";

const EXCHANGE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export default function SsoCompletePage() {
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current || typeof window === "undefined") return;
    startedRef.current = true;

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const code = fragment.get("sso_exchange") ?? "";

    // Remove the bearer code from visible browser state before making any
    // network request. URL fragments are not sent to Firebase or Render.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (!EXCHANGE_CODE_PATTERN.test(code)) {
      setError("This sign-in handoff is missing, invalid, or has already expired.");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    void apiFetch("/api/auth/sso/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { next?: unknown; message?: unknown }
          | null;
        if (!response.ok) {
          throw new Error(
            typeof payload?.message === "string"
              ? payload.message
              : "The sign-in handoff could not be completed.",
          );
        }

        clearCsrfToken();
        const next = normalizeInternalPath(
          typeof payload?.next === "string" ? payload.next : "/dashboard",
          "/dashboard",
        );
        window.location.replace(next);
      })
      .catch((caught: unknown) => {
        const message =
          caught instanceof Error && caught.name === "AbortError"
            ? "Sign-in completion timed out. Please start sign-in again."
            : caught instanceof Error
              ? caught.message
              : "The sign-in handoff could not be completed.";
        setError(message);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-sso-complete">
      <PublicSiteHeader />
      <main className="mx-auto flex min-h-[calc(100vh-81px)] max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <Card className="w-full max-w-lg border-border/70 bg-background/95 shadow-2xl shadow-slate-900/5">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="flex items-center gap-2 text-2xl">
              {error ? (
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              )}
              {error ? "Sign-in could not be completed" : "Completing secure sign-in"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="space-y-4" role="alert">
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {error}
                </p>
                <Button className="w-full rounded-xl" onClick={() => window.location.replace("/auth/login")}>
                  <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                  Return to sign in
                </Button>
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground" role="status" aria-live="polite">
                Verifying the one-time handoff and opening your workspace…
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
