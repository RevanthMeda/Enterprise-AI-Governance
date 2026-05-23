import { useLocation } from "wouter";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 shadow-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Access restricted</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your current role does not have permission to view this page.
            Contact your administrator if you believe this is an error.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
