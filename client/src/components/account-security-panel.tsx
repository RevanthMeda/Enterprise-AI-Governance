import { useState } from "react";
import { KeyRound, Settings as SettingsIcon, Shield } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type EnrollmentState = {
  secret: string;
  otpauthUrl: string;
};

export function AccountSecurityPanel({
  showInfrastructureNote = false,
}: {
  showInfrastructureNote?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isWorking, setIsWorking] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [enrollPassword, setEnrollPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableMfaCode, setDisableMfaCode] = useState("");
  const [disableRecoveryCode, setDisableRecoveryCode] = useState("");
  const [regenMfaCode, setRegenMfaCode] = useState("");
  const [regenRecoveryCode, setRegenRecoveryCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const refreshAuthUser = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  const startMfaEnrollment = async () => {
    setIsWorking(true);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/enroll", { currentPassword: enrollPassword });
      const body = await res.json();
      setEnrollment({ secret: body.secret, otpauthUrl: body.otpauthUrl });
      setRecoveryCodes([]);
      setEnrollPassword("");
      toast({ title: "MFA enrollment started" });
    } catch (error: any) {
      toast({ title: "Failed to start MFA enrollment", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const verifyMfaEnrollment = async () => {
    setIsWorking(true);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/verify-enroll", { code: verifyCode });
      const body = await res.json();
      setRecoveryCodes(body.recoveryCodes ?? []);
      setEnrollment(null);
      setVerifyCode("");
      await refreshAuthUser();
      toast({ title: "MFA enabled successfully" });
    } catch (error: any) {
      toast({ title: "MFA verification failed", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const disableMfa = async () => {
    setIsWorking(true);
    try {
      await apiRequest("POST", "/api/auth/mfa/disable", {
        password: disablePassword,
        mfaCode: disableMfaCode || undefined,
        recoveryCode: disableRecoveryCode || undefined,
      });
      setDisablePassword("");
      setDisableMfaCode("");
      setDisableRecoveryCode("");
      setRecoveryCodes([]);
      await refreshAuthUser();
      toast({ title: "MFA disabled" });
    } catch (error: any) {
      toast({ title: "Failed to disable MFA", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const regenerateRecoveryCodes = async () => {
    setIsWorking(true);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/recovery-codes/regenerate", {
        mfaCode: regenMfaCode || undefined,
        recoveryCode: regenRecoveryCode || undefined,
      });
      const body = await res.json();
      setRecoveryCodes(body.recoveryCodes ?? []);
      setRegenMfaCode("");
      setRegenRecoveryCode("");
      toast({ title: "Recovery codes regenerated" });
    } catch (error: any) {
      toast({ title: "Failed to regenerate recovery codes", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setIsWorking(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await refreshAuthUser();
      toast({ title: "Password updated" });
    } catch (error: any) {
      toast({ title: "Failed to update password", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card data-testid="panel-auth-security">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Multi-factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Authenticator app protection</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Add a TOTP code requirement for every local sign-in.
              </p>
            </div>
            <Badge variant={user?.mfaEnabled ? "default" : "secondary"} className="text-[10px]">
              {user?.mfaEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          {!user?.mfaEnabled && !enrollment && (
            <div className="space-y-2">
              <Input
                type="password"
                autoComplete="current-password"
                value={enrollPassword}
                onChange={(event) => setEnrollPassword(event.target.value)}
                placeholder="Confirm current password"
                data-testid="input-mfa-enroll-password"
              />
              <Button size="sm" onClick={startMfaEnrollment} disabled={isWorking || !enrollPassword} data-testid="button-mfa-start">
                Start MFA setup
              </Button>
            </div>
          )}

          {!user?.mfaEnabled && enrollment && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs font-medium">Scan QR code in your authenticator app</p>
              <div className="inline-flex rounded-md bg-white p-2">
                <QRCodeSVG value={enrollment.otpauthUrl} size={160} />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Manual setup secret</p>
                <Input value={enrollment.secret} readOnly data-testid="input-mfa-secret" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Enter 6-digit code to verify</p>
                <Input
                  value={verifyCode}
                  onChange={(event) => setVerifyCode(event.target.value)}
                  placeholder="Enter 6-digit code"
                  data-testid="input-mfa-verify-code"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={verifyMfaEnrollment}
                  disabled={isWorking || !verifyCode}
                  data-testid="button-mfa-verify"
                >
                  Verify and enable MFA
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEnrollment(null);
                    setVerifyCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {user?.mfaEnabled && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">Regenerate recovery codes</p>
                <p className="text-[11px] text-muted-foreground">
                  Verify with a current authenticator code or an existing recovery code.
                </p>
                <Input
                  value={regenMfaCode}
                  onChange={(event) => setRegenMfaCode(event.target.value)}
                  placeholder="Authenticator code (optional)"
                  data-testid="input-mfa-regen-code"
                />
                <Input
                  value={regenRecoveryCode}
                  onChange={(event) => setRegenRecoveryCode(event.target.value)}
                  placeholder="Recovery code (optional)"
                  data-testid="input-mfa-regen-recovery"
                />
                <Button size="sm" onClick={regenerateRecoveryCodes} disabled={isWorking} data-testid="button-mfa-regen">
                  Regenerate recovery codes
                </Button>
              </div>

              <div className="space-y-2 rounded-md border border-destructive/30 p-3">
                <p className="text-xs font-medium">Disable MFA</p>
                <p className="text-[11px] text-muted-foreground">
                  Requires your current password plus an authenticator code or recovery code.
                </p>
                <Input
                  type="password"
                  value={disablePassword}
                  onChange={(event) => setDisablePassword(event.target.value)}
                  placeholder="Current password"
                  data-testid="input-mfa-disable-password"
                />
                <Input
                  value={disableMfaCode}
                  onChange={(event) => setDisableMfaCode(event.target.value)}
                  placeholder="Authenticator code (optional)"
                  data-testid="input-mfa-disable-code"
                />
                <Input
                  value={disableRecoveryCode}
                  onChange={(event) => setDisableRecoveryCode(event.target.value)}
                  placeholder="Recovery code (optional)"
                  data-testid="input-mfa-disable-recovery"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={disableMfa}
                  disabled={isWorking || !disablePassword}
                  data-testid="button-mfa-disable"
                >
                  Disable MFA
                </Button>
              </div>
            </div>
          )}

          {recoveryCodes.length > 0 && (
            <div className="rounded-md border p-3 space-y-2" data-testid="mfa-recovery-codes">
              <p className="text-xs font-medium">Recovery codes</p>
              <p className="text-[11px] text-muted-foreground">Store these in a password manager or another secure location.</p>
              <div className="grid grid-cols-1 gap-1">
                {recoveryCodes.map((code) => (
                  <code key={code} className="text-[11px] rounded bg-muted px-2 py-1">
                    {code}
                  </code>
                ))}
              </div>
            </div>
          )}

          {showInfrastructureNote && (
            <div className="rounded-md border bg-muted/10 p-3">
              <p className="text-xs font-medium">Enterprise security controls</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Session governance, network controls, and telemetry key management stay under platform and infrastructure administration. This page covers the signed-in user’s own credentials.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="panel-password-security">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Password Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-medium">Change password</p>
            <p className="text-[11px] text-muted-foreground">
              Local passwords require at least 12 characters with upper, lower, number, and special characters.
            </p>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              data-testid="input-password-current"
            />
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              data-testid="input-password-new"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              data-testid="input-password-confirm"
            />
            <Button
              size="sm"
              onClick={changePassword}
              disabled={
                isWorking ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword.length < 12
              }
              data-testid="button-password-change"
            >
              Update password
            </Button>
          </div>

          <div className="rounded-md border bg-muted/10 p-3">
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium">Recovery</p>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Password reset links are available from the sign-in page for local accounts with a verified email address. SSO-managed identities should be reset through the external identity provider.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
