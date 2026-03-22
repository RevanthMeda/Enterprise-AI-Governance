import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Shield, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PublicSiteHeader } from "@/components/public-site-header";
import { usePageCopy } from "@/lib/page-copy";

type InvitePreview = {
  id: string;
  email: string;
  role: string;
  organizationName: string | null;
  expiresAt: string;
  status: string;
};

export default function InviteAcceptPage() {
  const pageCopy = usePageCopy();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
  }, []);

  const [loadingPreview, setLoadingPreview] = useState(true);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      if (!token) {
        setErrorMessage("Invite token is missing.");
        setLoadingPreview(false);
        return;
      }
      try {
        const res = await apiRequest("GET", `/api/organization/invites/preview?token=${encodeURIComponent(token)}`);
        const body = (await res.json()) as InvitePreview;
        if (!cancelled) {
          setPreview(body);
          setErrorMessage(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(error.message ?? "Failed to load invite");
        }
      } finally {
        if (!cancelled) {
          setLoadingPreview(false);
        }
      }
    };
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptInvite = async () => {
    if (!preview) return;
    setWorking(true);
    try {
      await apiRequest("POST", "/api/organization/invites/accept", {
        token,
        fullName,
        username,
        password,
        email: preview.email,
      });
      toast({
        title: "Invite accepted",
        description: "Your account is ready. Sign in to continue.",
      });
      setLocation("/auth/login");
    } catch (error: any) {
      toast({
        title: "Could not accept invite",
        description: error.message ?? "Invite acceptance failed",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-invite-accept">
      <PublicSiteHeader />
      <div className="flex min-h-[calc(100vh-81px)] items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-lg flex items-center justify-center gap-2">
              <UserPlus className="h-5 w-5" />
              {pageCopy.inviteAccept.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {pageCopy.inviteAccept.description}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPreview && (
              <p className="text-sm text-muted-foreground">Loading invite details...</p>
            )}

            {!loadingPreview && errorMessage && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3" data-testid="invite-error">
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}

            {!loadingPreview && preview && (
              <>
                <div className="rounded-md border p-3 space-y-2" data-testid="invite-preview">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Organization</span>
                    <span className="text-xs font-medium">{preview.organizationName || "Organization"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Email</span>
                    <span className="text-xs font-medium">{preview.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Role</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {preview.role.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Expires</span>
                    <span className="text-xs font-medium">{new Date(preview.expiresAt).toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Input
                    placeholder="Full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    data-testid="input-invite-fullname"
                  />
                  <Input
                    placeholder="Username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    data-testid="input-invite-username"
                  />
                  <Input
                    type="password"
                    placeholder="Password (min 12 chars)"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    data-testid="input-invite-password"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={working || !fullName || !username || password.length < 12}
                  onClick={acceptInvite}
                  data-testid="button-invite-accept"
                >
                  {working ? "Creating account..." : "Create account and join"}
                </Button>
              </>
            )}

            <div className="pt-2 border-t">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                Access is restricted to invited users only.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
