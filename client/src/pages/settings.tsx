import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  Globe,
  Building2,
  Clock,
  Users,
  UserCog,
  MailPlus,
  RotateCcw,
  Ban,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/api-url";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { usePageCopy } from "@/lib/page-copy";
import { AccountSecurityPanel } from "@/components/account-security-panel";
import { formatDateTime } from "@/lib/date-format";
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  DEFAULT_GUIDED_MODE,
  DEFAULT_WORKSPACE_LOCALE,
  accessibilityFontScales,
  dashboardViewPresets,
  dashboardWidgetMeta,
  getDashboardPreset,
  notificationFeedModes,
  notificationTypeLabels,
  resolveDefaultDashboardView,
  sanitizeAccessibilityPreferences,
  sanitizeDashboardWidgets,
  sanitizeNotificationPreferences,
  workspaceLocaleOptions,
} from "@shared/operator-preferences";
import {
  regionalComplianceFrameworkIds,
  regionalComplianceFrameworkLabels,
  regionalDataResidencyModeLabels,
  regionalDataResidencyModes,
  regionalPrimaryRegionLabels,
  regionalPrimaryRegions,
  type RegionalGovernanceProfile,
} from "@shared/regional-governance-profile";

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
  mode: "local" | "saml" | "oidc";
  ssoUrl: string | null;
  entityId: string | null;
  idpIssuer: string | null;
  certificate: string | null;
  callbackUrl: string | null;
  oidcIssuer: string | null;
  oidcAuthorizationUrl: string | null;
  oidcTokenUrl: string | null;
  oidcJwksUrl: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  oidcScopes: string;
  allowedDomains: string[];
  jitProvisioning: boolean;
  enforceSso: boolean;
  strictSamlValidation: boolean;
  defaultRole: string;
};

type OrganizationDomains = {
  domains: string[];
  entries: Array<{
    id: string | null;
    domain: string;
    isVerified: boolean;
    isPrimary: boolean;
    verificationRecordName: string | null;
    verificationRecordValue: string | null;
    verifiedAt: string | null;
  }>;
  source: "table" | "legacy" | "none";
};

type InlineFeedback = {
  type: "success" | "error";
  message: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const normalizeManagedDomainInput = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\.+$/, "");

const INVITE_ROLES = ["owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as const;
const SSO_ROLE_OPTIONS = INVITE_ROLES.filter((role) => role !== "owner");
const INVITE_STATUS_FILTERS = ["all", "pending", "accepted", "revoked", "expired"] as const;
const MEMBER_STATUS_FILTERS = ["all", "active", "inactive"] as const;
const ACTIVITY_TARGET_FILTERS = ["all", "organization", "organization_domain", "organization_invite", "membership"] as const;
const SETTINGS_PAGE_SIZE = 8;

export default function SettingsPage() {
  const pageCopy = usePageCopy();
  const { user } = useAuth();
  const { toast } = useToast();
  const initialTab = useMemo(() => {
    if (typeof window === "undefined") {
      return "access";
    }

    const tab = new URLSearchParams(window.location.search).get("tab");
    return ["access", "identity", "security", "activity", "governance"].includes(tab ?? "") ? String(tab) : "access";
  }, []);
  const [isWorking, setIsWorking] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("reviewer");
  const [authMode, setAuthMode] = useState<"local" | "saml" | "oidc">("local");
  const [ssoUrl, setSsoUrl] = useState("");
  const [entityId, setEntityId] = useState("");
  const [idpIssuer, setIdpIssuer] = useState("");
  const [certificate, setCertificate] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcAuthorizationUrl, setOidcAuthorizationUrl] = useState("");
  const [oidcTokenUrl, setOidcTokenUrl] = useState("");
  const [oidcJwksUrl, setOidcJwksUrl] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcScopes, setOidcScopes] = useState("openid profile email");
  const [managedDomainsDraft, setManagedDomainsDraft] = useState<string[]>([]);
  const [pendingDomainInput, setPendingDomainInput] = useState("");
  const [jitProvisioning, setJitProvisioning] = useState(false);
  const [enforceSso, setEnforceSso] = useState(false);
  const [strictSamlValidation, setStrictSamlValidation] = useState(false);
  const [defaultRole, setDefaultRole] = useState<(typeof SSO_ROLE_OPTIONS)[number]>("reviewer");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteStatusFilter, setInviteStatusFilter] = useState<(typeof INVITE_STATUS_FILTERS)[number]>("all");
  const [invitePage, setInvitePage] = useState(0);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState<(typeof MEMBER_STATUS_FILTERS)[number]>("all");
  const [memberPage, setMemberPage] = useState(0);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityTargetFilter, setActivityTargetFilter] = useState<(typeof ACTIVITY_TARGET_FILTERS)[number]>("all");
  const [copiedDomainRecord, setCopiedDomainRecord] = useState<string | null>(null);
  const [copiedSsoUrl, setCopiedSsoUrl] = useState(false);
  const [domainFeedback, setDomainFeedback] = useState<InlineFeedback | null>(null);
  const [activityFeedback, setActivityFeedback] = useState<InlineFeedback | null>(null);
  const [workspaceDashboardView, setWorkspaceDashboardView] = useState<"operations" | "reviewer" | "executive" | "custom">("operations");
  const [workspaceDashboardWidgets, setWorkspaceDashboardWidgets] = useState<string[]>([]);
  const [guidedModeEnabled, setGuidedModeEnabled] = useState(DEFAULT_GUIDED_MODE);
  const [notificationFeedMode, setNotificationFeedMode] = useState<(typeof notificationFeedModes)[number]>("stream");
  const [priorityOnlyNotifications, setPriorityOnlyNotifications] = useState(false);
  const [mutedNotificationTypes, setMutedNotificationTypes] = useState<string[]>([]);
  const [highContrastEnabled, setHighContrastEnabled] = useState(DEFAULT_ACCESSIBILITY_PREFERENCES.highContrast);
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState(DEFAULT_ACCESSIBILITY_PREFERENCES.reducedMotion);
  const [fontScale, setFontScale] = useState<(typeof accessibilityFontScales)[number]>(DEFAULT_ACCESSIBILITY_PREFERENCES.fontScale);
  const [workspaceLocale, setWorkspaceLocale] = useState<(typeof workspaceLocaleOptions)[number]>(DEFAULT_WORKSPACE_LOCALE);
  const [regionalProfile, setRegionalProfile] = useState<RegionalGovernanceProfile | null>(null);

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
  const { data: orgDomains } = useQuery<OrganizationDomains>({
    queryKey: ["/api/organization/domains"],
  });
  const { data: backgroundJobsData } = useQuery<{
    summary: {
      pending: number;
      processing: number;
      succeeded: number;
      failed: number;
    };
    jobs: Array<{
      id: string;
      type: string;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
      updatedAt: string;
      createdAt: string;
    }>;
  }>({
    queryKey: ["/api/organization/background-jobs"],
  });
  const { data: regionalProfileData } = useQuery<RegionalGovernanceProfile>({
    queryKey: ["/api/organization/regional-governance-profile"],
  });

  useEffect(() => {
    if (!orgAuthSettings) return;
    setAuthMode(orgAuthSettings.mode);
    setSsoUrl(orgAuthSettings.ssoUrl ?? "");
    setEntityId(orgAuthSettings.entityId ?? "");
    setIdpIssuer(orgAuthSettings.idpIssuer ?? "");
    setCertificate(orgAuthSettings.certificate ?? "");
    setCallbackUrl(orgAuthSettings.callbackUrl ?? "");
    setOidcIssuer(orgAuthSettings.oidcIssuer ?? "");
    setOidcAuthorizationUrl(orgAuthSettings.oidcAuthorizationUrl ?? "");
    setOidcTokenUrl(orgAuthSettings.oidcTokenUrl ?? "");
    setOidcJwksUrl(orgAuthSettings.oidcJwksUrl ?? "");
    setOidcClientId(orgAuthSettings.oidcClientId ?? "");
    setOidcClientSecret(orgAuthSettings.oidcClientSecret ?? "");
    setOidcScopes(orgAuthSettings.oidcScopes ?? "openid profile email");
    setJitProvisioning(orgAuthSettings.jitProvisioning);
    setEnforceSso(orgAuthSettings.enforceSso);
    setStrictSamlValidation(orgAuthSettings.strictSamlValidation);
    if (SSO_ROLE_OPTIONS.includes(orgAuthSettings.defaultRole as (typeof SSO_ROLE_OPTIONS)[number])) {
      setDefaultRole(orgAuthSettings.defaultRole as (typeof SSO_ROLE_OPTIONS)[number]);
    }
  }, [orgAuthSettings]);

  useEffect(() => {
    if (!orgDomains) return;
    setManagedDomainsDraft(orgDomains.domains);
    setPendingDomainInput("");
  }, [orgDomains]);

  useEffect(() => {
    if (!regionalProfileData) return;
    setRegionalProfile(regionalProfileData);
  }, [regionalProfileData]);

  useEffect(() => {
    const onboarding = user?.currentOrganizationOnboarding;
    const currentOrgRole =
      user?.organizations?.find((organization) => organization.id === user.currentOrganizationId)?.role ??
      user?.role ??
      null;
    const defaultView = resolveDefaultDashboardView(currentOrgRole);
    const resolvedView = onboarding?.dashboardView ?? defaultView;
    const fallbackWidgets =
      getDashboardPreset(resolvedView)?.widgets ?? getDashboardPreset(defaultView)?.widgets ?? [];
    const notificationPreferences = sanitizeNotificationPreferences(onboarding?.notificationPreferences);
    const accessibilityPreferences = sanitizeAccessibilityPreferences(onboarding?.accessibilityPreferences);

    setWorkspaceDashboardView(resolvedView);
    setWorkspaceDashboardWidgets(sanitizeDashboardWidgets(onboarding?.dashboardWidgets, fallbackWidgets));
    setGuidedModeEnabled(onboarding?.guidedMode ?? DEFAULT_GUIDED_MODE);
    setNotificationFeedMode(notificationPreferences.feedMode);
    setPriorityOnlyNotifications(notificationPreferences.priorityOnly);
    setMutedNotificationTypes(notificationPreferences.mutedTypes);
    setHighContrastEnabled(accessibilityPreferences.highContrast);
    setReducedMotionEnabled(accessibilityPreferences.reducedMotion);
    setFontScale(accessibilityPreferences.fontScale);
    setWorkspaceLocale(onboarding?.workspaceLocale ?? DEFAULT_WORKSPACE_LOCALE);
  }, [user]);

  useEffect(() => {
    setInvitePage(0);
  }, [inviteSearch, inviteStatusFilter, invites.length]);

  useEffect(() => {
    setMemberPage(0);
  }, [memberSearch, memberStatusFilter, members.length]);

  const backgroundJobSummary = backgroundJobsData?.summary ?? {
    pending: 0,
    processing: 0,
    succeeded: 0,
    failed: 0,
  };
  const failedBackgroundJobs = backgroundJobsData?.jobs ?? [];

  const refreshOrgAdminData = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/invites"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/admin-audit"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/domains"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/organization/background-jobs"] });
  };

  const saveOrgAuthSettings = async () => {
    setIsWorking(true);
    try {
      await apiRequest("PATCH", "/api/organization/auth-settings", {
        mode: authMode,
        ssoUrl: ssoUrl.trim() || null,
        entityId: entityId.trim() || null,
        idpIssuer: idpIssuer.trim() || null,
        certificate: certificate.trim() || null,
        callbackUrl: callbackUrl.trim() || null,
        oidcIssuer: oidcIssuer.trim() || null,
        oidcAuthorizationUrl: oidcAuthorizationUrl.trim() || null,
        oidcTokenUrl: oidcTokenUrl.trim() || null,
        oidcJwksUrl: oidcJwksUrl.trim() || null,
        oidcClientId: oidcClientId.trim() || null,
        oidcClientSecret: oidcClientSecret.trim() || null,
        oidcScopes: oidcScopes.trim() || null,
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

  const saveOrganizationDomains = async () => {
    setIsWorking(true);
    try {
      const domains = Array.from(
        new Set(managedDomainsDraft.map((value) => normalizeManagedDomainInput(value)).filter(Boolean)),
      );

      setManagedDomainsDraft(domains);
      setPendingDomainInput("");
      await apiRequest("PUT", "/api/organization/domains", { domains });
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/domains"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/auth-settings"] });
      await refreshOrgAdminData();
      setDomainFeedback({ type: "success", message: "Organization domains updated." });
      toast({ title: "Organization domains updated" });
    } catch (error: any) {
      setDomainFeedback({ type: "error", message: error.message || "Failed to update organization domains." });
      toast({ title: "Failed to update organization domains", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const updateOrganizationDomain = async (
    domainId: string,
    payload: { isPrimary?: boolean },
    successTitle: string,
  ) => {
    setIsWorking(true);
    try {
      await apiRequest("PATCH", `/api/organization/domains/${domainId}`, payload);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/domains"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/auth-settings"] });
      await refreshOrgAdminData();
      setDomainFeedback({ type: "success", message: successTitle });
      toast({ title: successTitle });
    } catch (error: any) {
      setDomainFeedback({ type: "error", message: error.message || "Failed to update organization domain." });
      toast({ title: "Failed to update organization domain", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const deleteOrganizationDomain = async (domainId: string) => {
    setIsWorking(true);
    try {
      await apiRequest("DELETE", `/api/organization/domains/${domainId}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/domains"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/auth-settings"] });
      await refreshOrgAdminData();
      setDomainFeedback({ type: "success", message: "Organization domain deleted." });
      toast({ title: "Organization domain deleted" });
    } catch (error: any) {
      setDomainFeedback({ type: "error", message: error.message || "Failed to delete organization domain." });
      toast({ title: "Failed to delete organization domain", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const verifyOrganizationDomain = async (domainId: string) => {
    setIsWorking(true);
    try {
      await apiRequest("POST", `/api/organization/domains/${domainId}/verify`, {});
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/domains"] });
      await refreshOrgAdminData();
      setDomainFeedback({ type: "success", message: "Domain verified through DNS TXT lookup." });
      toast({ title: "Domain verified" });
    } catch (error: any) {
      setDomainFeedback({ type: "error", message: error.message || "Domain verification failed." });
      toast({ title: "Domain verification failed", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const retryBackgroundJob = async (jobId: string) => {
    setIsWorking(true);
    try {
      await apiRequest("POST", `/api/organization/background-jobs/${jobId}/retry`, {});
      await refreshOrgAdminData();
      setActivityFeedback({ type: "success", message: "Background job queued for retry." });
      toast({ title: "Background job retried" });
    } catch (error: any) {
      setActivityFeedback({ type: "error", message: error.message || "Failed to retry background job." });
      toast({ title: "Failed to retry background job", description: error.message, variant: "destructive" });
    } finally {
      setIsWorking(false);
    }
  };

  const copyDomainVerificationRecord = async (domain: string, recordName: string, recordValue: string) => {
    try {
      await navigator.clipboard.writeText(`${recordName} = ${recordValue}`);
      setCopiedDomainRecord(domain);
      setDomainFeedback({ type: "success", message: `Copied TXT record for ${domain}.` });
      toast({ title: "Verification record copied" });
      window.setTimeout(() => {
        setCopiedDomainRecord((current) => (current === domain ? null : current));
      }, 1800);
    } catch (error: any) {
      setDomainFeedback({ type: "error", message: error?.message || "Failed to copy verification record." });
      toast({ title: "Failed to copy verification record", description: error?.message, variant: "destructive" });
    }
  };

  const copySsoStartUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSsoUrl(true);
      setActivityFeedback({ type: "success", message: "Copied SSO start URL." });
      toast({ title: "SSO start URL copied" });
      window.setTimeout(() => setCopiedSsoUrl(false), 1800);
    } catch (error: any) {
      setActivityFeedback({ type: "error", message: error?.message || "Failed to copy SSO start URL." });
      toast({ title: "Failed to copy SSO start URL", description: error?.message, variant: "destructive" });
    }
  };

  const exportAdminAuditCsv = () => {
    try {
      const rows = [
        ["action", "actor_name", "target_type", "created_at"],
        ...filteredAdminAudit.map((event) => [
          event.action,
          event.actorName,
          event.targetType || "system",
          event.createdAt,
        ]),
      ];

      const csv = rows
        .map((row) =>
          row
            .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `admin-activity-${currentOrg?.slug || "organization"}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setActivityFeedback({ type: "success", message: "Admin activity exported as CSV." });
    } catch (error: any) {
      setActivityFeedback({ type: "error", message: error?.message || "Failed to export admin activity." });
      toast({ title: "Failed to export admin activity", description: error?.message, variant: "destructive" });
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
      const deliveryMessage =
        body.delivery?.message ||
        (body.inviteToken ? `Invite token: ${body.inviteToken}` : "Invite created successfully.");
      toast({
        title: "Invite created",
        description: deliveryMessage,
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
      const deliveryMessage =
        body.delivery?.message ||
        (body.inviteToken ? `Updated invite token: ${body.inviteToken}` : "Invite resent successfully.");
      toast({
        title: "Invite resent",
        description: deliveryMessage,
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
  const addManagedDomain = () => {
    const normalized = normalizeManagedDomainInput(pendingDomainInput);
    if (!normalized) return;
    setManagedDomainsDraft((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setPendingDomainInput("");
  };
  const removeManagedDomain = (domain: string) => {
    setManagedDomainsDraft((current) => current.filter((item) => item !== domain));
  };
  const persistedDomains = orgDomains?.domains ?? [];
  const effectiveDomains = managedDomainsDraft.length > 0 ? managedDomainsDraft : persistedDomains;
  const persistedDomainEntries = orgDomains?.entries ?? [];
  const effectiveDomainEntries = effectiveDomains.map((domain, index) => {
    const stored = persistedDomainEntries.find((entry) => entry.domain === domain);
    return (
      stored ?? {
        id: null,
        domain,
        isVerified: false,
        isPrimary: index === 0,
        verificationRecordName: null,
        verificationRecordValue: null,
        verifiedAt: null,
      }
    );
  });
  const hasManagedDomainChanges =
    JSON.stringify([...managedDomainsDraft].sort()) !== JSON.stringify([...persistedDomains].sort());
  const domainSource = orgDomains?.source ?? "none";
  const normalizedInviteSearch = inviteSearch.trim().toLowerCase();
  const filteredInvites = invites.filter((invite) => {
    const matchesSearch =
      normalizedInviteSearch.length === 0 ||
      invite.email.toLowerCase().includes(normalizedInviteSearch) ||
      invite.role.toLowerCase().includes(normalizedInviteSearch) ||
      (invite.invitedByName ?? "").toLowerCase().includes(normalizedInviteSearch);
    const matchesStatus = inviteStatusFilter === "all" || invite.status === inviteStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      normalizedMemberSearch.length === 0 ||
      member.username.toLowerCase().includes(normalizedMemberSearch) ||
      (member.fullName ?? "").toLowerCase().includes(normalizedMemberSearch) ||
      (member.email ?? "").toLowerCase().includes(normalizedMemberSearch) ||
      member.role.toLowerCase().includes(normalizedMemberSearch);
    const matchesStatus = memberStatusFilter === "all" || member.membershipState === memberStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const filteredAdminAudit = adminAudit.filter((event) => {
    const matchesSearch =
      normalizedActivitySearch.length === 0 ||
      event.action.toLowerCase().includes(normalizedActivitySearch) ||
      event.actorName.toLowerCase().includes(normalizedActivitySearch) ||
      (event.targetType ?? "system").toLowerCase().includes(normalizedActivitySearch);
    const matchesTarget = activityTargetFilter === "all" || (event.targetType ?? "system") === activityTargetFilter;
    return matchesSearch && matchesTarget;
  });
  const invitePageCount = Math.max(1, Math.ceil(filteredInvites.length / SETTINGS_PAGE_SIZE));
  const memberPageCount = Math.max(1, Math.ceil(filteredMembers.length / SETTINGS_PAGE_SIZE));
  const effectiveInvitePage = Math.min(invitePage, invitePageCount - 1);
  const effectiveMemberPage = Math.min(memberPage, memberPageCount - 1);
  const visibleInvites = filteredInvites.slice(
    effectiveInvitePage * SETTINGS_PAGE_SIZE,
    (effectiveInvitePage + 1) * SETTINGS_PAGE_SIZE,
  );
  const visibleMembers = filteredMembers.slice(
    effectiveMemberPage * SETTINGS_PAGE_SIZE,
    (effectiveMemberPage + 1) * SETTINGS_PAGE_SIZE,
  );
  const currentOrg =
    user?.organizations?.find((organization) => organization.id === user.currentOrganizationId) ??
    user?.organizations?.[0] ??
    null;
  const ssoStartUrl = resolveApiUrl(
    `${
      authMode === "oidc" ? "/api/auth/oidc/start" : "/api/auth/sso/start"
    }?org=${encodeURIComponent(currentOrg?.slug || "your-org-slug")}&next=${encodeURIComponent("/")}`,
  );
  const toggleWorkspaceWidget = (widgetId: string) => {
    setWorkspaceDashboardWidgets((current) => {
      const next = new Set(current);
      if (next.has(widgetId)) {
        next.delete(widgetId);
      } else {
        next.add(widgetId);
      }
      return next.size > 0 ? Array.from(next) : current;
    });
    setWorkspaceDashboardView("custom");
  };
  const toggleMutedNotificationType = (typeId: string) => {
    setMutedNotificationTypes((current) => {
      if (current.includes(typeId)) {
        return current.filter((entry) => entry !== typeId);
      }
      return [...current, typeId];
    });
  };

  const saveWorkspacePreferences = async () => {
    setIsWorking(true);
    try {
      const response = await apiRequest("POST", "/api/auth/onboarding-state", {
        dashboardView: workspaceDashboardView,
        dashboardWidgets: workspaceDashboardWidgets,
        guidedMode: guidedModeEnabled,
        notificationPreferences: {
          feedMode: notificationFeedMode,
          priorityOnly: priorityOnlyNotifications,
          mutedTypes: mutedNotificationTypes,
        },
        accessibilityPreferences: {
          highContrast: highContrastEnabled,
          reducedMotion: reducedMotionEnabled,
          fontScale,
        },
        workspaceLocale,
      });
      const updatedUser = (await response.json()) as AuthUser;
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
      toast({
        title: "Workspace preferences saved",
        description: "Dashboard layout, notification focus, and accessibility preferences were updated for this organization.",
      });
    } catch (error) {
      toast({
        title: "Unable to save workspace preferences",
        description: error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const saveRegionalGovernanceProfile = async () => {
    if (!regionalProfile) {
      return;
    }

    setIsWorking(true);
    try {
      await apiRequest("PUT", "/api/organization/regional-governance-profile", regionalProfile);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/regional-governance-profile"] });
      toast({
        title: "Regional governance profile saved",
        description: "Primary region, residency posture, and framework scope were updated.",
      });
    } catch (error) {
      toast({
        title: "Unable to save regional governance profile",
        description: error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="page-shell" data-testid="page-settings">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{pageCopy.settings.title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {pageCopy.settings.description}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-settings-sections">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 md:grid-cols-5">
          <TabsTrigger value="access" data-testid="tab-settings-access">Access</TabsTrigger>
          <TabsTrigger value="identity" data-testid="tab-settings-identity">Identity</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-settings-security">Security</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-settings-activity">Activity</TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-settings-governance">Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="security" className="mt-4">
          <AccountSecurityPanel showInfrastructureNote />
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card data-testid="panel-background-job-health">
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
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-medium">Pending and recent invites</p>
                <div className="flex flex-col gap-2 md:flex-row">
                  <Input
                    value={inviteSearch}
                    onChange={(e) => setInviteSearch(e.target.value)}
                    placeholder="Search invites"
                    className="md:w-[240px]"
                    data-testid="input-org-invite-search"
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={inviteStatusFilter}
                    onChange={(e) => setInviteStatusFilter(e.target.value as (typeof INVITE_STATUS_FILTERS)[number])}
                    data-testid="select-org-invite-status-filter"
                  >
                    {INVITE_STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {status === "all" ? "All statuses" : status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rounded-md border divide-y">
                {filteredInvites.length === 0 && (
                  <div className="p-3 text-[11px] text-muted-foreground">No invites created yet.</div>
                )}
                {visibleInvites.map((invite) => (
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
                      <Badge variant="outline" className="text-[10px]">
                        resend #{invite.resendCount}
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
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Showing {filteredInvites.length === 0 ? 0 : effectiveInvitePage * SETTINGS_PAGE_SIZE + 1}-
                  {Math.min((effectiveInvitePage + 1) * SETTINGS_PAGE_SIZE, filteredInvites.length)} of {filteredInvites.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInvitePage((current) => Math.max(0, current - 1))}
                    disabled={effectiveInvitePage === 0}
                    data-testid="button-org-invite-page-prev"
                  >
                    Previous
                  </Button>
                  <span>
                    Page {effectiveInvitePage + 1} / {invitePageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInvitePage((current) => Math.min(invitePageCount - 1, current + 1))}
                    disabled={effectiveInvitePage >= invitePageCount - 1}
                    data-testid="button-org-invite-page-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-medium">Organization members</p>
                <div className="flex flex-col gap-2 md:flex-row">
                  <Input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search members"
                    className="md:w-[240px]"
                    data-testid="input-org-member-search"
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={memberStatusFilter}
                    onChange={(e) => setMemberStatusFilter(e.target.value as (typeof MEMBER_STATUS_FILTERS)[number])}
                    data-testid="select-org-member-status-filter"
                  >
                    {MEMBER_STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {status === "all" ? "All member states" : status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rounded-md border divide-y">
                {filteredMembers.length === 0 && (
                  <div className="p-3 text-[11px] text-muted-foreground">No members in this organization.</div>
                )}
                {visibleMembers.map((member) => {
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
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge variant={member.membershipState === "active" ? "default" : "secondary"} className="text-[10px]">
                          {member.membershipState}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {member.role.replace("_", " ")}
                        </Badge>
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
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Showing {filteredMembers.length === 0 ? 0 : effectiveMemberPage * SETTINGS_PAGE_SIZE + 1}-
                  {Math.min((effectiveMemberPage + 1) * SETTINGS_PAGE_SIZE, filteredMembers.length)} of {filteredMembers.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMemberPage((current) => Math.max(0, current - 1))}
                    disabled={effectiveMemberPage === 0}
                    data-testid="button-org-member-page-prev"
                  >
                    Previous
                  </Button>
                  <span>
                    Page {effectiveMemberPage + 1} / {memberPageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMemberPage((current) => Math.min(memberPageCount - 1, current + 1))}
                    disabled={effectiveMemberPage >= memberPageCount - 1}
                    data-testid="button-org-member-page-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="identity" className="mt-4">
          <div className="grid grid-cols-1 gap-4">
            <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Identity & Enterprise SSO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Authentication mode</p>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={authMode}
                  onChange={(e) => setAuthMode(e.target.value as "local" | "saml" | "oidc")}
                  data-testid="select-auth-mode"
                >
                  <option value="local">Local (username/password)</option>
                  <option value="saml">SAML SSO</option>
                  <option value="oidc">OIDC / OpenID Connect</option>
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
              {authMode === "saml" && (
                <label className="flex items-center gap-2 rounded-md border p-2 text-xs md:col-span-2">
                  <input
                    type="checkbox"
                    checked={strictSamlValidation}
                    onChange={(e) => setStrictSamlValidation(e.target.checked)}
                    data-testid="checkbox-auth-strict-saml"
                  />
                  Strict SAML validation (signature, issuer, audience, assertion timing)
                </label>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Managed organization domains</p>
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-org-domain-source">
                  {domainSource === "table" ? "Managed domains" : domainSource === "legacy" ? "Settings fallback" : "Not configured"}
                </Badge>
              </div>
              {domainFeedback && (
                <div
                  className={`rounded-md border px-3 py-2 text-[11px] ${
                    domainFeedback.type === "success"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                  data-testid="alert-org-domain-feedback"
                >
                  {domainFeedback.message}
                </div>
              )}
              <div className="rounded-md border bg-muted/10 p-3" data-testid="panel-org-domain-help">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-medium">Domain verification flow</p>
                </div>
                <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  <li>1. Add or keep the organization domain in this list.</li>
                  <li>2. Publish the TXT record shown for that domain in your DNS provider.</li>
                  <li>3. Wait for DNS propagation, then click <span className="font-medium text-foreground">Verify DNS</span>.</li>
                  <li>4. Once verified, set the correct primary domain for SSO/JIT routing.</li>
                </ol>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Domain source</p>
                  </div>
                  <p className="mt-2 text-sm font-medium capitalize">{domainSource}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    First-class table-backed domains are preferred over legacy auth settings.
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium">JIT status</p>
                  </div>
                  <p className="mt-2 text-sm font-medium">{jitProvisioning ? "Enabled" : "Disabled"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Default role: {defaultRole.replace("_", " ")}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Provisioning readiness</p>
                  </div>
                  <p className="mt-2 text-sm font-medium">
                    {effectiveDomains.length > 0 ? `${effectiveDomains.length} domains configured` : "No domains configured"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {jitProvisioning
                      ? "Allowlisted SSO users can be provisioned automatically."
                      : "JIT is off, so new SSO users will be denied until invited."}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  value={pendingDomainInput}
                  onChange={(e) => setPendingDomainInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addManagedDomain();
                    }
                  }}
                  placeholder="Add domain e.g. company.com"
                  data-testid="input-org-managed-domains"
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={addManagedDomain}
                  disabled={isWorking || !pendingDomainInput.trim()}
                  data-testid="button-org-domains-add"
                >
                  Add domain
                </Button>
              </div>
              <div className="space-y-2">
                {effectiveDomainEntries.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">No managed domains configured.</span>
                )}
                {effectiveDomainEntries.map((entry) => (
                  <div
                    key={entry.domain}
                    className="flex flex-col gap-2 rounded-md border bg-muted/20 px-3 py-3 text-[11px] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{entry.domain}</span>
                        <Badge variant={entry.isVerified ? "default" : "secondary"} className="text-[10px]">
                          {entry.isVerified ? "Verified" : "Unverified"}
                        </Badge>
                        {entry.isPrimary && (
                          <Badge variant="outline" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                        {!entry.id && (
                          <Badge variant="outline" className="text-[10px]">
                            Draft
                          </Badge>
                        )}
                      </div>
                      {entry.id && entry.verificationRecordName && entry.verificationRecordValue && (
                        <div className="rounded-md border bg-background/80 p-2">
                          <p className="text-[10px] text-muted-foreground">Publish this TXT record to verify ownership</p>
                          <code className="mt-1 block break-all text-[10px]">
                            {entry.verificationRecordName} = {entry.verificationRecordValue}
                          </code>
                          {entry.verifiedAt && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Verified at {new Date(entry.verifiedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap md:justify-end">
                      {entry.id && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() =>
                              copyDomainVerificationRecord(
                                entry.domain,
                                entry.verificationRecordName!,
                                entry.verificationRecordValue!,
                              )
                            }
                            disabled={
                              isWorking ||
                              hasManagedDomainChanges ||
                              !entry.verificationRecordName ||
                              !entry.verificationRecordValue
                            }
                            data-testid={`button-org-domain-copy-${entry.domain}`}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            {copiedDomainRecord === entry.domain ? "Copied" : "Copy TXT"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => verifyOrganizationDomain(entry.id!)}
                            disabled={isWorking || hasManagedDomainChanges}
                            data-testid={`button-org-domain-verify-${entry.domain}`}
                          >
                            {entry.isVerified ? "Re-check DNS" : "Verify DNS"}
                          </Button>
                          {!entry.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() =>
                                updateOrganizationDomain(entry.id!, { isPrimary: true }, "Primary domain updated")
                              }
                              disabled={isWorking || hasManagedDomainChanges}
                              data-testid={`button-org-domain-primary-${entry.domain}`}
                            >
                              Set primary
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => deleteOrganizationDomain(entry.id!)}
                            disabled={isWorking || hasManagedDomainChanges}
                            data-testid={`button-org-domain-delete-${entry.domain}`}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {!entry.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => removeManagedDomain(entry.domain)}
                          disabled={isWorking}
                          data-testid={`button-org-domain-remove-${entry.domain}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  JIT provisioning evaluates these domains before the legacy auth settings fallback.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveOrganizationDomains}
                  disabled={isWorking || !hasManagedDomainChanges}
                  data-testid="button-org-domains-save"
                >
                  Save domains
                </Button>
              </div>
              {hasManagedDomainChanges && (
                <p className="text-[11px] text-muted-foreground">
                  Save or discard draft domain changes before using verify, primary, or delete actions.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {authMode === "oidc" ? "OIDC" : "SSO"} start URL: <code>{ssoStartUrl}</code>
              </p>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => copySsoStartUrl(ssoStartUrl)}
                  data-testid="button-auth-sso-start-url-copy"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {copiedSsoUrl ? "Copied" : `Copy ${authMode === "oidc" ? "OIDC" : "SSO"} start URL`}
                </Button>
              </div>
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

            {authMode === "oidc" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC issuer</p>
                  <Input
                    value={oidcIssuer}
                    onChange={(e) => setOidcIssuer(e.target.value)}
                    placeholder="https://login.example.com"
                    data-testid="input-auth-oidc-issuer"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC authorization URL</p>
                  <Input
                    value={oidcAuthorizationUrl}
                    onChange={(e) => setOidcAuthorizationUrl(e.target.value)}
                    placeholder="https://login.example.com/oauth2/v1/authorize"
                    data-testid="input-auth-oidc-authorization-url"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC token URL</p>
                  <Input
                    value={oidcTokenUrl}
                    onChange={(e) => setOidcTokenUrl(e.target.value)}
                    placeholder="https://login.example.com/oauth2/v1/token"
                    data-testid="input-auth-oidc-token-url"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC JWKS URL</p>
                  <Input
                    value={oidcJwksUrl}
                    onChange={(e) => setOidcJwksUrl(e.target.value)}
                    placeholder="https://login.example.com/oauth2/v1/keys"
                    data-testid="input-auth-oidc-jwks-url"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC client ID</p>
                  <Input
                    value={oidcClientId}
                    onChange={(e) => setOidcClientId(e.target.value)}
                    placeholder="ai-control-tower"
                    data-testid="input-auth-oidc-client-id"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC client secret (optional for PKCE-only providers)</p>
                  <Input
                    value={oidcClientSecret}
                    onChange={(e) => setOidcClientSecret(e.target.value)}
                    placeholder="client-secret"
                    type="password"
                    data-testid="input-auth-oidc-client-secret"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC scopes</p>
                  <Input
                    value={oidcScopes}
                    onChange={(e) => setOidcScopes(e.target.value)}
                    placeholder="openid profile email"
                    data-testid="input-auth-oidc-scopes"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">OIDC callback URL</p>
                  <Input
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                    placeholder="https://app.example.com/api/auth/oidc/callback"
                    data-testid="input-auth-oidc-callback-url"
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
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="grid grid-cols-1 gap-4">
            <Card id="background-job-health">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Background Job Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-muted-foreground">Pending</div>
                    <div className="text-lg font-semibold">{backgroundJobSummary.pending}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-muted-foreground">Processing</div>
                    <div className="text-lg font-semibold">{backgroundJobSummary.processing}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-muted-foreground">Succeeded</div>
                    <div className="text-lg font-semibold">{backgroundJobSummary.succeeded}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-[11px] text-muted-foreground">Failed</div>
                    <div className="text-lg font-semibold">{backgroundJobSummary.failed}</div>
                  </div>
                </div>

                <div className="rounded-md border divide-y">
                  {failedBackgroundJobs.length === 0 && (
                    <div className="p-3 text-[11px] text-muted-foreground">No failed background jobs for this organization.</div>
                  )}
                  {failedBackgroundJobs.map((job) => (
                    <div key={job.id} className="p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">{job.type}</p>
                          <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Attempts {job.attempts}/{job.maxAttempts} · {formatDateTime(job.updatedAt)}
                        </p>
                        {job.lastError && (
                          <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">{job.lastError}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => {
                          void retryBackgroundJob(job.id);
                        }}
                        disabled={isWorking}
                        data-testid={`button-background-job-retry-${job.id}`}
                      >
                        Retry
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Admin Activity Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Search admin activity"
                  className="md:w-[260px]"
                  data-testid="input-org-admin-audit-search"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={activityTargetFilter}
                  onChange={(e) => setActivityTargetFilter(e.target.value as (typeof ACTIVITY_TARGET_FILTERS)[number])}
                  data-testid="select-org-admin-audit-target-filter"
                >
                  {ACTIVITY_TARGET_FILTERS.map((target) => (
                    <option key={target} value={target}>
                      {target === "all" ? "All targets" : target}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={exportAdminAuditCsv}
                data-testid="button-org-admin-audit-export"
              >
                Export CSV
              </Button>
            </div>
            {activityFeedback && (
              <div
                className={`mb-3 rounded-md border px-3 py-2 text-[11px] ${
                  activityFeedback.type === "success"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
                data-testid="alert-org-admin-audit-feedback"
              >
                {activityFeedback.message}
              </div>
            )}
            <div className="rounded-md border divide-y">
              {filteredAdminAudit.length === 0 && (
                <div className="p-3 text-[11px] text-muted-foreground">No admin activity recorded yet.</div>
              )}
              {filteredAdminAudit.slice(0, 10).map((event) => (
                <div key={event.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{event.action}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {event.actorName} · {event.targetType || "system"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="governance" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Compliance Frameworks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!regionalProfile ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  {regionalComplianceFrameworkIds.map((frameworkId) => (
                    <label key={frameworkId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                      <span>{regionalComplianceFrameworkLabels[frameworkId]}</span>
                      <input
                        type="checkbox"
                        checked={regionalProfile.activeFrameworks.includes(frameworkId)}
                        onChange={() =>
                          setRegionalProfile((current) =>
                            current
                              ? {
                                  ...current,
                                  activeFrameworks: current.activeFrameworks.includes(frameworkId)
                                    ? current.activeFrameworks.length > 1
                                      ? current.activeFrameworks.filter((entry) => entry !== frameworkId)
                                      : current.activeFrameworks
                                    : [...current.activeFrameworks, frameworkId].slice(0, regionalComplianceFrameworkIds.length),
                                }
                              : current,
                          )
                        }
                        disabled={isWorking}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use this to reflect the actual frameworks the organization is operating against, not just the default demo posture.
                </p>
              </>
            )}
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
            {!regionalProfile ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <Field label="Primary region">
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={regionalProfile.primaryRegion}
                    onChange={(event) =>
                      setRegionalProfile((current) =>
                        current
                          ? {
                              ...current,
                              primaryRegion: event.target.value as RegionalGovernanceProfile["primaryRegion"],
                              secondaryRegions: current.secondaryRegions.filter((entry) => entry !== event.target.value),
                            }
                          : current,
                      )
                    }
                    disabled={isWorking}
                  >
                    {regionalPrimaryRegions.map((region) => (
                      <option key={region} value={region}>
                        {regionalPrimaryRegionLabels[region]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Data residency mode">
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={regionalProfile.dataResidencyMode}
                    onChange={(event) =>
                      setRegionalProfile((current) =>
                        current
                          ? {
                              ...current,
                              dataResidencyMode: event.target.value as RegionalGovernanceProfile["dataResidencyMode"],
                            }
                          : current,
                      )
                    }
                    disabled={isWorking}
                  >
                    {regionalDataResidencyModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {regionalDataResidencyModeLabels[mode]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="space-y-2">
                  <p className="text-xs font-medium">Secondary regions</p>
                  <div className="grid gap-2">
                    {regionalPrimaryRegions
                      .filter((region) => region !== regionalProfile.primaryRegion)
                      .map((region) => (
                        <label key={region} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                          <span>{regionalPrimaryRegionLabels[region]}</span>
                          <input
                            type="checkbox"
                            checked={regionalProfile.secondaryRegions.includes(region)}
                            onChange={() =>
                              setRegionalProfile((current) =>
                                current
                                  ? {
                                      ...current,
                                      secondaryRegions: current.secondaryRegions.includes(region)
                                        ? current.secondaryRegions.filter((entry) => entry !== region)
                                        : [...current.secondaryRegions, region].slice(0, regionalPrimaryRegions.length - 1),
                                    }
                                  : current,
                              )
                            }
                            disabled={isWorking}
                          />
                        </label>
                      ))}
                  </div>
                </div>
              </>
            )}
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

          <div className="mt-4 flex justify-end">
            <Button onClick={saveRegionalGovernanceProfile} disabled={isWorking || !regionalProfile}>
              Save regional governance profile
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Operator Workspace
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium">Dashboard starting view</p>
                  <div className="flex flex-wrap gap-2">
                    {dashboardViewPresets.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant={workspaceDashboardView === preset.id ? "default" : "outline"}
                        onClick={() => {
                          setWorkspaceDashboardView(preset.id);
                          setWorkspaceDashboardWidgets(preset.widgets);
                        }}
                        disabled={isWorking}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {workspaceDashboardView === "custom"
                      ? "Custom mode is active because widget visibility has diverged from the saved presets."
                      : dashboardViewPresets.find((preset) => preset.id === workspaceDashboardView)?.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Visible dashboard widgets</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {workspaceDashboardWidgets.length} visible
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {Object.entries(dashboardWidgetMeta).map(([widgetId, widget]) => (
                      <label key={widgetId} className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={workspaceDashboardWidgets.includes(widgetId)}
                          onChange={() => toggleWorkspaceWidget(widgetId)}
                          disabled={isWorking}
                        />
                        <span>
                          <span className="block font-medium">{widget.label}</span>
                          <span className="text-muted-foreground">{widget.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 rounded-md border border-dashed border-border/70 bg-background/70 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={guidedModeEnabled}
                    onChange={(e) => setGuidedModeEnabled(e.target.checked)}
                    disabled={isWorking}
                  />
                  Guided mode keeps launch checklist, navigation cues, and explanatory panels visible.
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MailPlus className="h-4 w-4 text-muted-foreground" />
                  In-App Notification Focus
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium">Default bell experience</p>
                  <div className="flex flex-wrap gap-2">
                    {notificationFeedModes.map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={notificationFeedMode === mode ? "default" : "outline"}
                        onClick={() => setNotificationFeedMode(mode)}
                        disabled={isWorking}
                      >
                        {mode === "digest" ? "Digest" : "Live stream"}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Digest mode surfaces grouped unread themes and top incidents first. Live stream keeps the bell focused on individual events.
                  </p>
                </div>

                <label className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={priorityOnlyNotifications}
                    onChange={(e) => setPriorityOnlyNotifications(e.target.checked)}
                    disabled={isWorking}
                  />
                  Show only high-priority governance items in the notification feed by default.
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Muted notification types</p>
                    <Badge variant="outline" className="text-[10px]">
                      {mutedNotificationTypes.length} muted
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {Object.entries(notificationTypeLabels).map(([typeId, label]) => (
                      <label key={typeId} className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={mutedNotificationTypes.includes(typeId)}
                          onChange={() => toggleMutedNotificationType(typeId)}
                          disabled={isWorking}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    These controls shape the in-app notification feed and bell, not external delivery channels.
                  </p>
                </div>

                <div className="rounded-md border border-dashed border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                  Use this page when an operator wants a calmer reviewer workspace, an executive summary layout,
                  or less noise from low-priority system updates without changing the underlying governance policy.
                </div>

                <Button onClick={saveWorkspacePreferences} disabled={isWorking}>
                  Save workspace preferences
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  Accessibility and Comfort
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={highContrastEnabled}
                    onChange={(e) => setHighContrastEnabled(e.target.checked)}
                    disabled={isWorking}
                  />
                  Use stronger borders, focus visibility, and contrast across the workspace.
                </label>

                <label className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={reducedMotionEnabled}
                    onChange={(e) => setReducedMotionEnabled(e.target.checked)}
                    disabled={isWorking}
                  />
                  Reduce motion and animation across charts, transitions, and UI chrome.
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Workspace language and date locale</p>
                  <div className="flex flex-wrap gap-2">
                    {workspaceLocaleOptions.map((entry) => (
                      <Button
                        key={entry}
                        type="button"
                        size="sm"
                        variant={workspaceLocale === entry ? "default" : "outline"}
                        onClick={() => setWorkspaceLocale(entry)}
                        disabled={isWorking}
                      >
                        {entry}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This now drives locale-aware date formatting plus translated navigation, knowledge, and selected workspace surfaces. Full page-by-page translation is still expanding.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Workspace font scale</p>
                  <div className="flex flex-wrap gap-2">
                    {accessibilityFontScales.map((entry) => (
                      <Button
                        key={entry}
                        type="button"
                        size="sm"
                        variant={fontScale === entry ? "default" : "outline"}
                        onClick={() => setFontScale(entry)}
                        disabled={isWorking}
                      >
                        {entry === "default" ? "Default" : entry === "large" ? "Large" : "Extra large"}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    These settings are stored per active organization workspace, so reviewer and executive layouts can stay distinct.
                  </p>
                </div>

                <div className="rounded-md border border-dashed border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                  Dark mode already exists through the header toggle. These settings tighten readability and reduce fatigue on long reviewer sessions.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
