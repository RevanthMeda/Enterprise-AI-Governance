import type { NextFunction, Request, Response } from "express";
import { storage, type UserMembershipContext } from "./storage";
import { getVisibleActiveMemberships } from "./auth-visibility";

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        organizationId: string;
        membershipRole: string;
        membershipId: string;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    currentOrganizationId?: string;
  }
}

function pickMembership(
  memberships: UserMembershipContext[],
  explicitOrgId?: string,
  sessionOrgId?: string,
) {
  const activeMemberships = memberships.filter((m) => m.membershipState === "active");
  if (activeMemberships.length === 0) return undefined;

  if (explicitOrgId) {
    return activeMemberships.find((m) => m.organizationId === explicitOrgId);
  }

  if (sessionOrgId) {
    return activeMemberships.find((m) => m.organizationId === sessionOrgId);
  }

  if (activeMemberships.length === 1) {
    return activeMemberships[0];
  }

  const defaultMembership = activeMemberships.find((m) => m.isDefault);
  if (defaultMembership) {
    return defaultMembership;
  }

  return activeMemberships[0];
}

export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const explicitOrgId = req.header("X-Organization-Id") || undefined;
  const sessionOrgId = req.session.currentOrganizationId;
  const memberships = await storage.getMembershipsByUserId(req.user.id);
  const accessibleMemberships = getVisibleActiveMemberships(req.user, memberships, sessionOrgId);

  const membership = pickMembership(accessibleMemberships, explicitOrgId, sessionOrgId);
  if (!membership) {
    return res.status(403).json({ message: "No active organization membership" });
  }

  req.tenant = {
    organizationId: membership.organizationId,
    membershipRole: membership.role,
    membershipId: membership.id,
  };
  req.session.currentOrganizationId = membership.organizationId;

  return next();
}

export function requireOrgRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenant) {
      return res.status(500).json({ message: "Tenant context missing" });
    }
    if (!allowedRoles.includes(req.tenant.membershipRole)) {
      return res.status(403).json({ message: "Insufficient organization permissions" });
    }
    return next();
  };
}
