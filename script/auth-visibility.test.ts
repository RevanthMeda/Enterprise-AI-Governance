import test from "node:test";
import assert from "node:assert/strict";
import {
  getVisibleActiveMemberships,
  isPlatformAdminUser,
  pickCurrentOrganizationId,
} from "../server/auth-visibility";

test("platform admins retain visibility across all active organizations", () => {
  const memberships = [
    { organizationId: "org-a", membershipState: "active", isDefault: true },
    { organizationId: "org-b", membershipState: "active", isDefault: false },
    { organizationId: "org-c", membershipState: "invited", isDefault: false },
  ];

  const visible = getVisibleActiveMemberships(
    { role: "admin", username: "platform-admin" },
    memberships,
    "org-b",
  );

  assert.deepEqual(
    visible.map((membership) => membership.organizationId),
    ["org-a", "org-b"],
  );
  assert.equal(isPlatformAdminUser({ role: "admin", username: "platform-admin" }), true);
});

test("non-platform users are scoped to their current organization", () => {
  const memberships = [
    { organizationId: "org-a", membershipState: "active", isDefault: true },
    { organizationId: "org-b", membershipState: "active", isDefault: false },
    { organizationId: "org-c", membershipState: "suspended", isDefault: false },
  ];

  const visible = getVisibleActiveMemberships(
    { role: "reviewer", username: "mia.foster" },
    memberships,
    "org-b",
  );

  assert.deepEqual(visible.map((membership) => membership.organizationId), ["org-b"]);
});

test("current organization falls back to default active membership for non-admin users", () => {
  const memberships = [
    { organizationId: "org-a", membershipState: "active", isDefault: false },
    { organizationId: "org-b", membershipState: "active", isDefault: true },
  ];

  assert.equal(pickCurrentOrganizationId(undefined, memberships), "org-b");

  const visible = getVisibleActiveMemberships(
    { role: "reviewer", username: "olivia.grant" },
    memberships,
  );

  assert.deepEqual(visible.map((membership) => membership.organizationId), ["org-b"]);
});
