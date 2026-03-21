import type { AuthOrganization, AuthUser } from "@/hooks/use-auth";

export const ORG_ADMIN_ROLES = ["owner", "admin"] as const;
export const ORG_GOVERNANCE_ROLES = ["owner", "admin", "cro", "ciso", "compliance_lead"] as const;
export const ORG_OPERATIONAL_ROLES = [
  "owner",
  "admin",
  "cro",
  "ciso",
  "compliance_lead",
  "reviewer",
  "system_owner",
] as const;
export const ORG_AUDIT_ROLES = ["owner", "admin", "cro", "ciso", "compliance_lead", "auditor"] as const;
export const ORG_REGISTRY_ROLES = [...ORG_GOVERNANCE_ROLES, "system_owner"] as const;
export const ORG_INCIDENT_ROLES = [...ORG_OPERATIONAL_ROLES, "auditor"] as const;
export const ORG_DECISION_TRACE_ROLES = [...ORG_OPERATIONAL_ROLES, "auditor"] as const;
export const ORG_APPROVAL_ROLES = [...ORG_OPERATIONAL_ROLES, "auditor"] as const;
export const ORG_BULK_CONTROL_ROLES = [...ORG_GOVERNANCE_ROLES, "system_owner"] as const;
export const ORG_EVIDENCE_ROLES = [...ORG_GOVERNANCE_ROLES, "auditor"] as const;

function getActiveOrganization(user: AuthUser | null): AuthOrganization | null {
  if (!user) {
    return null;
  }

  return (
    user.organizations.find((organization) => organization.id === user.currentOrganizationId) ??
    user.organizations[0] ??
    null
  );
}

export function getActiveOrganizationRole(user: AuthUser | null): string | null {
  return getActiveOrganization(user)?.role ?? null;
}

export function getDisplayRole(user: AuthUser | null): string | null {
  return getActiveOrganizationRole(user) ?? user?.role ?? null;
}

export function hasActiveOrganizationRole(user: AuthUser | null, allowedRoles: readonly string[]): boolean {
  const activeRole = getActiveOrganizationRole(user);
  return Boolean(activeRole && allowedRoles.includes(activeRole));
}

export function getAppAccess(user: AuthUser | null) {
  return {
    canAccessRegistry: hasActiveOrganizationRole(user, ORG_REGISTRY_ROLES),
    canAccessRisk: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessCompliance: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessRuntimeMonitoring: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessIncidents: hasActiveOrganizationRole(user, ORG_INCIDENT_ROLES),
    canAccessApprovals: hasActiveOrganizationRole(user, ORG_APPROVAL_ROLES),
    canAccessDecisionTrace: hasActiveOrganizationRole(user, ORG_DECISION_TRACE_ROLES),
    canAccessAuditLog: hasActiveOrganizationRole(user, ORG_AUDIT_ROLES),
    canAccessCalendar: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessBulkControls: hasActiveOrganizationRole(user, ORG_BULK_CONTROL_ROLES),
    canAccessExitReadiness: hasActiveOrganizationRole(user, ORG_EVIDENCE_ROLES),
    canAccessPortfolioControl: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
    canAccessTelemetryPolicy: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessTelemetryAdapter: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessRetentionControl: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessSettings: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
    canAccessIntegrations: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
    canAccessBilling: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
    canSwitchOrganizations: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
  };
}
