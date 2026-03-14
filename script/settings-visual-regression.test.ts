import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("settings page keeps tabbed admin layout and key controls", async () => {
  const settingsPath = new URL("../client/src/pages/settings.tsx", import.meta.url);
  const settingsSource = await fs.readFile(settingsPath, "utf8");

  assert.match(settingsSource, /data-testid="tabs-settings-sections"/, "Expected tabbed settings layout");
  assert.match(settingsSource, /data-testid="tab-settings-access"/, "Expected access tab");
  assert.match(settingsSource, /data-testid="tab-settings-identity"/, "Expected identity tab");
  assert.match(settingsSource, /data-testid="tab-settings-security"/, "Expected security tab");
  assert.match(settingsSource, /data-testid="tab-settings-activity"/, "Expected activity tab");
  assert.match(settingsSource, /data-testid="tab-settings-governance"/, "Expected governance tab");

  assert.match(settingsSource, /data-testid="panel-org-domain-help"/, "Expected domain verification help panel");
  assert.match(settingsSource, /data-testid="alert-org-domain-feedback"/, "Expected inline domain feedback banner");
  assert.match(settingsSource, /button-org-domain-copy-\$\{entry\.domain\}/, "Expected domain TXT copy control");
  assert.match(settingsSource, /button-org-domain-verify-\$\{entry\.domain\}/, "Expected domain verify control");
  assert.match(settingsSource, /button-org-domain-primary-\$\{entry\.domain\}/, "Expected primary domain control");
  assert.match(settingsSource, /button-org-domain-delete-\$\{entry\.domain\}/, "Expected domain delete control");
  assert.match(settingsSource, /data-testid="button-auth-sso-start-url-copy"/, "Expected SSO start URL copy control");

  assert.match(settingsSource, /data-testid="input-org-invite-search"/, "Expected invite search control");
  assert.match(settingsSource, /data-testid="button-org-invite-page-next"/, "Expected invite pagination control");
  assert.match(settingsSource, /data-testid="input-org-member-search"/, "Expected member search control");
  assert.match(settingsSource, /data-testid="button-org-member-page-next"/, "Expected member pagination control");

  assert.match(settingsSource, /data-testid="input-org-admin-audit-search"/, "Expected admin activity search");
  assert.match(settingsSource, /data-testid="select-org-admin-audit-target-filter"/, "Expected admin activity target filter");
  assert.match(settingsSource, /data-testid="button-org-admin-audit-export"/, "Expected admin activity export action");
  assert.match(settingsSource, /data-testid="alert-org-admin-audit-feedback"/, "Expected admin activity feedback banner");
  assert.match(settingsSource, /data-testid="panel-background-job-health"/, "Expected background job health panel");
});
