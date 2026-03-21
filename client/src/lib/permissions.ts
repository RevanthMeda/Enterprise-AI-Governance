import type { AuthOrganization, AuthUser } from "@/hooks/use-auth";

export const ORG_ADMIN_ROLES = ["owner", "admin"] as const;
export const ORG_GOVERNANCE_ROLES = ["owner", "admin", "cro", "ciso", "compliance_lead"] as const;

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
    canAccessRuntimeMonitoring: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessExitReadiness: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessPortfolioControl: Boolean(user),
    canAccessTelemetryPolicy: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessTelemetryAdapter: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessRetentionControl: hasActiveOrganizationRole(user, ORG_GOVERNANCE_ROLES),
    canAccessSettings: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
    canAccessIntegrations: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
    canAccessBilling: hasActiveOrganizationRole(user, ORG_ADMIN_ROLES),
  };
}
