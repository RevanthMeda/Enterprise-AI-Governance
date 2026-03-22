type UserLike = {
  role?: string | null;
  username?: string | null;
};

type MembershipLike = {
  organizationId: string;
  membershipState: string;
  isDefault?: boolean | null;
  organizationName?: string;
  organizationSlug?: string;
  role?: string;
};

function normalizeUsername(username: string | null | undefined) {
  return (username ?? "").trim().toLowerCase();
}

export function isPlatformAdminUser(user: UserLike) {
  return user.role === "admin" || normalizeUsername(user.username) === "admin";
}

export function pickCurrentOrganizationId(
  currentOrganizationId: string | null | undefined,
  memberships: MembershipLike[],
): string | null {
  const activeMemberships = memberships.filter((membership) => membership.membershipState === "active");
  if (activeMemberships.length === 0) return null;

  if (currentOrganizationId) {
    const exists = activeMemberships.some((membership) => membership.organizationId === currentOrganizationId);
    if (exists) return currentOrganizationId;
  }

  if (activeMemberships.length === 1) {
    return activeMemberships[0].organizationId;
  }

  const defaultMembership = activeMemberships.find((membership) => membership.isDefault);
  if (defaultMembership) {
    return defaultMembership.organizationId;
  }

  return activeMemberships[0].organizationId;
}

export function getVisibleActiveMemberships<T extends MembershipLike>(
  user: UserLike,
  memberships: T[],
  currentOrganizationId?: string | null,
): T[];
export function getVisibleActiveMemberships<T extends MembershipLike>(
  user: UserLike,
  memberships: T[],
  currentOrganizationId?: string | null,
) {
  const activeMemberships = memberships.filter((membership) => membership.membershipState === "active");
  if (activeMemberships.length === 0) {
    return [];
  }

  if (isPlatformAdminUser(user)) {
    return activeMemberships;
  }

  const resolvedCurrentOrganizationId = pickCurrentOrganizationId(currentOrganizationId, activeMemberships);
  if (!resolvedCurrentOrganizationId) {
    return [];
  }

  return activeMemberships.filter((membership) => membership.organizationId === resolvedCurrentOrganizationId);
}
