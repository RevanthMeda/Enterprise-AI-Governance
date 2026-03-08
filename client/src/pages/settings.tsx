import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeSVG } from "qrcode.react";
import {
  Settings as SettingsIcon,
  Shield,
  Globe,
  Building2,
  Clock,
  Users,
  UserCog,
  MailPlus,
  RotateCcw,
  Ban,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type OrganizationMember = {
  membershipId: string;
  userId: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  membershipState: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type OrganizationInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedByName: string | null;
  expiresAt: string;
  resendCount: number;
  createdAt: string;
};

type AdminAuditEvent = {
  id: string;
  action: string;
  actorName: string;
  targetType: string | null;
  createdAt: string;
};

type OrgAuthSettings = {
  mode: "local" | "saml";
  ssoUrl: string | null;
  entityId: string | null;
  idpIssuer: string | null;
  certificate: string | null;
  callbackUrl: string | null;
  allowedDomains: string[];
  jitProvisioning: boolean;
  enforceSso: boolean;
  strictSamlValidation: boolean;
  defaultRole: string;
};

const INVITE_ROLES = ["owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as const;
const SSO_ROLE_OPTIONS = INVITE_ROLES.filter((role) => role !== "owner");

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isWorking, setIsWorking] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableMfaCode, setDisableMfaCode] = useState("");
  const [disableRecoveryCode, setDisableRecoveryCode] = useState("");
  const [regenMfaCode, setRegenMfaCode] = useState("");
  const [regenRecoveryCode, setRegenRecoveryCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("reviewer");
  const [authMode, setAuthMode] = useState<"local" | "saml">("local");
  const [ssoUrl, setSsoUrl] = useState("");
  const [entityId, setEntityId] = useState("");
  const [idpIssuer, setIdpIssuer] = useState("");
  const [certificate, setCertificate] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [allowedDomainsText, setAllowedDomainsText] = useState("");
  const [jitProvisioning, setJitProvisioning] = useState(false);
  const [enforceSso, setEnforceSso] = useState(false);
  const [strictSamlValidation, setStrictSamlValidation] = useState(false);
  const [defaultRole, setDefaultRole] = useState<(typeof SSO_ROLE_OPTIONS)[number]>("reviewer");

  const { data: members = [] } = useQuery<OrganizationMember[]>({
    queryKey: ["/api/organization/members"],
  });
  const { data: invites = [] } = useQuery<OrganizationInvite[]>({
    queryKey: ["/api/organization/invites"],
  });
  const { data: adminAudit = [] } = useQuery<AdminAuditEvent[]>({
    queryKey: ["/api/organization/admin-audit"],
  });
  const { data: orgAuthSettings } = useQuery<OrgAuthSettings>({
    queryKey: ["/api/organization/auth-settings"],
  });

  useEffect(() => {
    if (!orgAuthSettings) return;
    setAuthMode(orgAuthSettings.mode);
    setSsoUrl(orgAuthSettings.ssoUrl ?? "");
    setEntityId(orgAuthSettings.entityId ?? "");
    setIdpIssuer(orgAuthSettings.idpIssuer ?? "");
    setCertificate(orgAuthSettings.certificate ?? "");
    setCallbackUrl(orgAuthSettings.callbackUrl ?? "");
    setAllowedDomainsText(orgAuthSettings.allowedDomains.join(", "));
    setJitProvisioning(orgAuthSettings.jitProvisioning);
    setEnforceSso(orgAuthSettings.enforceSso);
    setStrictSamlValidation(orgAuthSettings.strictSamlValidation);
    if (SSO_ROLE_OPTIONS.includes(orgAuthSettings.defaultRole as (typeof SSO_ROLE_OPTIONS)[number])) {
      setDefaultRole(orgAuthSettings.defaultRole as (typeof SSO_ROLE_OPTIONS)[number]);
    }
  }, [orgAuthSettings]);

  const refreshAuthUser = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  const refreshOrgAdminData = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/invites"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/admin-audit"] });
  };

  const saveOrgAuthSettings = async () => {
    setIsWorking(true);
    try {
      const allowedDomains = allowedDomainsText
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

      await apiRequest("PATCH", "/api/organization/auth-settings", {
        mode: authMode,
        ssoUrl: ssoUrl.trim() || null,
        entityId: entityId.trim() || null,
        idpIssuer: idpIssuer.trim() || null,
        certificate: certificate.trim() || null,
        callbackUrl: callbackUrl.trim() || null,
        allowedDomains,
        jitProvisioning,
        enforceSso,
        strictSamlValidation,
        defaultRole,
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/organization/auth-settings"] });
      await refreshOrgAdminData();
      toast({ title: "Identity settings updated" });
    } catch (error: any) {
      toast({ title: "Failed to update identity settings", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const startMfaEnrollment = async () => {
    setIsWorking(true);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/enroll", {});
      const body = await res.json();
      setEnrollment({ secret: body.secret, otpauthUrl: body.otpauthUrl });
      setRecoveryCodes([]);
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

  const createInvite = async () => {
    setIsWorking(true);
    try {
      const res = await apiRequest("POST", "/api/organization/invites", {
        email: inviteEmail,
        role: inviteRole,
      });
      const body = await res.json();
      setInviteEmail("");
      await refreshOrgAdminData();
      toast({
        title: "Invite created",
        description: `Invite token: ${body.inviteToken}`,
      });
    } catch (error: any) {
      toast({ title: "Failed to create invite", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const resendInvite = async (inviteId: string) => {
    setIsWorking(true);
    try {
      const res = await apiRequest("POST", `/api/organization/invites/${inviteId}/resend`, {});
      const body = await res.json();
      await refreshOrgAdminData();
      toast({
        title: "Invite resent",
        description: `Updated invite token: ${body.inviteToken}`,
      });
    } catch (error: any) {
      toast({ title: "Failed to resend invite", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setIsWorking(true);
    try {
      await apiRequest("POST", `/api/organization/invites/${inviteId}/revoke`, {});
      await refreshOrgAdminData();
      toast({ title: "Invite revoked" });
    } catch (error: any) {
      toast({ title: "Failed to revoke invite", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const updateMember = async (membershipId: string, payload: { role?: string; membershipState?: "active" | "inactive" }) => {
    setIsWorking(true);
    try {
      await apiRequest("PATCH", `/api/organization/members/${membershipId}`, payload);
      await refreshOrgAdminData();
      toast({ title: "Member updated" });
    } catch (error: any) {
      toast({ title: "Failed to update member", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const activeMembersCount = members.filter((member) => member.membershipState === "active").length;
  const pendingInvitesCount = invites.filter((invite) => invite.status === "pending").length;
  const currentOrg =
    user?.organizations?.find((organization) => organization.id === user.currentOrganizationId) ??
    user?.organizations?.[0] ??
    null;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-settings">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform configuration and compliance settings
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              Authentication Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Multi-factor authentication (TOTP)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Add an authenticator app code requirement for every login.
                </p>
              </div>
              <Badge variant={user?.mfaEnabled ? "default" : "secondary"} className="text-[10px]">
                {user?.mfaEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            {!user?.mfaEnabled && !enrollment && (
              <Button size="sm" onClick={startMfaEnrollment} disabled={isWorking} data-testid="button-mfa-start">
                Start MFA setup
              </Button>
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
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder="123456"
                    data-testid="input-mfa-verify-code"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={verifyMfaEnrollment} disabled={isWorking || !verifyCode} data-testid="button-mfa-verify">
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
                    Verify with a current authenticator code or existing recovery code.
                  </p>
                  <Input
                    value={regenMfaCode}
                    onChange={(e) => setRegenMfaCode(e.target.value)}
                    placeholder="Authenticator code (optional)"
                    data-testid="input-mfa-regen-code"
                  />
                  <Input
                    value={regenRecoveryCode}
                    onChange={(e) => setRegenRecoveryCode(e.target.value)}
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
                    Requires password plus current authenticator code or recovery code.
                  </p>
                  <Input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Current password"
                    data-testid="input-mfa-disable-password"
                  />
                  <Input
                    value={disableMfaCode}
                    onChange={(e) => setDisableMfaCode(e.target.value)}
                    placeholder="Authenticator code (optional)"
                    data-testid="input-mfa-disable-code"
                  />
                  <Input
                    value={disableRecoveryCode}
                    onChange={(e) => setDisableRecoveryCode(e.target.value)}
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
                <p className="text-xs font-medium">Recovery codes (store securely)</p>
                <div className="grid grid-cols-1 gap-1">
                  {recoveryCodes.map((code) => (
                    <code key={code} className="text-[11px] rounded bg-muted px-2 py-1">{code}</code>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Organization</span>
              <span className="text-xs font-medium">{currentOrg?.name || "Unknown"}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Organization slug</span>
              <Badge variant="secondary" className="text-[10px]">{currentOrg?.slug || "n/a"}</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Users</span>
              <span className="text-xs font-medium">{activeMembersCount} active</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Invite team member</p>
                <Badge variant="secondary" className="text-[10px]">{pendingInvitesCount} pending invites</Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_auto]">
                <Input
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-org-invite-email"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as (typeof INVITE_ROLES)[number])}
                  data-testid="select-org-invite-role"
                >
                  {INVITE_ROLES.map((role) => (
                    <option key={role} value={role}>{role.replace("_", " ")}</option>
                  ))}
                </select>
                <Button
                  onClick={createInvite}
                  disabled={isWorking || !inviteEmail}
                  data-testid="button-org-invite-create"
                >
                  <MailPlus className="h-4 w-4 mr-1" />
                  Send invite
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Invites create token-based onboarding links and are tracked in admin audit.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Pending and recent invites</p>
              <div className="rounded-md border divide-y">
                {invites.length === 0 && (
                  <div className="p-3 text-[11px] text-muted-foreground">No invites created yet.</div>
                )}
                {invites.slice(0, 12).map((invite) => (
                  <div key={invite.id} className="p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-medium">{invite.email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Role: {invite.role.replace("_", " ")} · Expires: {new Date(invite.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={invite.status === "pending" ? "default" : "secondary"} className="text-[10px]">
                        {invite.status}
                      </Badge>
                      {invite.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => resendInvite(invite.id)}
                            data-testid={`button-org-invite-resend-${invite.id}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Resend
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isWorking}
                            onClick={() => revokeInvite(invite.id)}
                            data-testid={`button-org-invite-revoke-${invite.id}`}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" />
                            Revoke
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Organization members</p>
              <div className="rounded-md border divide-y">
                {members.length === 0 && (
                  <div className="p-3 text-[11px] text-muted-foreground">No members in this organization.</div>
                )}
                {members.map((member) => {
                  const isSelf = member.userId === user?.id;
                  return (
                    <div key={member.membershipId} className="p-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-medium">
                          {member.fullName || member.username}
                          {isSelf ? " (you)" : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.email || "No email"} · {member.membershipState}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          value={member.role}
                          disabled={isWorking || isSelf}
                          onChange={(e) => updateMember(member.membershipId, { role: e.target.value })}
                          data-testid={`select-org-member-role-${member.membershipId}`}
                        >
                          {INVITE_ROLES.map((role) => (
                            <option key={role} value={role}>{role.replace("_", " ")}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isWorking || isSelf}
                          onClick={() =>
                            updateMember(member.membershipId, {
                              membershipState: member.membershipState === "active" ? "inactive" : "active",
                            })
                          }
                          data-testid={`button-org-member-toggle-${member.membershipId}`}
                        >
                          <UserCog className="h-3.5 w-3.5 mr-1" />
                          {member.membershipState === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Identity & SSO (SAML)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Authentication mode</p>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={authMode}
                  onChange={(e) => setAuthMode(e.target.value as "local" | "saml")}
                  data-testid="select-auth-mode"
                >
                  <option value="local">Local (username/password)</option>
                  <option value="saml">SAML SSO</option>
                </select>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Default role for JIT users</p>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={defaultRole}
                  onChange={(e) => setDefaultRole(e.target.value as (typeof SSO_ROLE_OPTIONS)[number])}
                  data-testid="select-auth-default-role"
                >
                  {SSO_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
                <input
                  type="checkbox"
                  checked={jitProvisioning}
                  onChange={(e) => setJitProvisioning(e.target.checked)}
                  data-testid="checkbox-auth-jit"
                />
                Enable JIT user provisioning
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
                <input
                  type="checkbox"
                  checked={enforceSso}
                  onChange={(e) => setEnforceSso(e.target.checked)}
                  data-testid="checkbox-auth-enforce-sso"
                />
                Enforce SSO (disable local login for members)
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 text-xs md:col-span-2">
                <input
                  type="checkbox"
                  checked={strictSamlValidation}
                  onChange={(e) => setStrictSamlValidation(e.target.checked)}
                  data-testid="checkbox-auth-strict-saml"
                />
                Strict SAML validation (signature, issuer, audience, assertion timing)
              </label>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">Allowed email domains (comma-separated)</p>
              <Input
                value={allowedDomainsText}
                onChange={(e) => setAllowedDomainsText(e.target.value)}
                placeholder="company.com, subsidiary.org"
                data-testid="input-auth-allowed-domains"
              />
              <p className="text-[11px] text-muted-foreground">
                SSO start URL: <code>/api/auth/sso/start?org={currentOrg?.slug || "your-org-slug"}&amp;next=/</code>
              </p>
            </div>

            {authMode === "saml" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Identity Provider SSO URL</p>
                  <Input
                    value={ssoUrl}
                    onChange={(e) => setSsoUrl(e.target.value)}
                    placeholder="https://idp.example.com/sso"
                    data-testid="input-auth-sso-url"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Service Provider Entity ID</p>
                  <Input
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                    placeholder="urn:ai-control-tower:sp"
                    data-testid="input-auth-entity-id"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Expected IdP Issuer (optional)</p>
                  <Input
                    value={idpIssuer}
                    onChange={(e) => setIdpIssuer(e.target.value)}
                    placeholder="https://idp.example.com/metadata"
                    data-testid="input-auth-idp-issuer"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Assertion consumer callback URL</p>
                  <Input
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                    placeholder="https://app.example.com/api/auth/sso/callback"
                    data-testid="input-auth-callback-url"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">IdP certificate (PEM)</p>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                    value={certificate}
                    onChange={(e) => setCertificate(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    data-testid="input-auth-certificate"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={saveOrgAuthSettings}
                disabled={isWorking}
                data-testid="button-auth-settings-save"
              >
                Save identity settings
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Admin Activity Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border divide-y">
              {adminAudit.length === 0 && (
                <div className="p-3 text-[11px] text-muted-foreground">No admin activity recorded yet.</div>
              )}
              {adminAudit.slice(0, 10).map((event) => (
                <div key={event.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{event.action}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {event.actorName} · {event.targetType || "system"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Compliance Frameworks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs">EU AI Act</span>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">Active</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs">NIST AI RMF</span>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">Active</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs">ISO/IEC 42001</span>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">Active</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Geographic Scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Primary Region</span>
              <span className="text-xs font-medium">European Union</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Secondary Regions</span>
              <span className="text-xs font-medium">US, UK</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Data Residency</span>
              <span className="text-xs font-medium">EU (Frankfurt)</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Key Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <span className="text-xs font-medium block">EU AI Act - Prohibited AI</span>
                <span className="text-[10px] text-muted-foreground">Chapters I-II enforcement</span>
              </div>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">In Effect</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <div>
                <span className="text-xs font-medium block">EU AI Act - High Risk</span>
                <span className="text-[10px] text-muted-foreground">Full obligations apply</span>
              </div>
              <Badge className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 no-default-active-elevate">Aug 2026</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <div>
                <span className="text-xs font-medium block">ISO/IEC 42001 Certification</span>
                <span className="text-[10px] text-muted-foreground">Target certification date</span>
              </div>
              <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 no-default-active-elevate">Q4 2026</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
