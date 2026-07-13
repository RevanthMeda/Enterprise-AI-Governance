import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildIncidentHref,
  resolveIncidentDeepLink,
  resolveVisibleIncidentId,
} from "../client/src/lib/incident-navigation";

const incidents = [
  { id: "incident-open", status: "open" },
  { id: "incident-contained", status: "contained" },
  { id: "incident-resolved", status: "resolved" },
  { id: "incident-postmortem", status: "postmortem" },
];

test("incident links preserve the exact encoded incident identity", () => {
  assert.equal(buildIncidentHref("incident/open & urgent"), "/incidents?incidentId=incident%2Fopen%20%26%20urgent");
  assert.equal(buildIncidentHref(""), "/incidents");
  assert.equal(buildIncidentHref(null), "/incidents");
});

test("incident deep links are accepted only for incidents returned by the current organization", () => {
  assert.deepEqual(resolveIncidentDeepLink("incident-open", incidents), {
    incidentId: "incident-open",
    queueScope: "active",
  });
  assert.deepEqual(resolveIncidentDeepLink("incident-resolved", incidents), {
    incidentId: "incident-resolved",
    queueScope: "resolved",
  });
  assert.equal(resolveIncidentDeepLink("incident-from-another-org", incidents), null);
});

test("incident detail selection never falls outside the visible queue", () => {
  const visibleIds = ["incident-open", "incident-contained"];
  assert.equal(resolveVisibleIncidentId("incident-contained", visibleIds), "incident-contained");
  assert.equal(resolveVisibleIncidentId("incident-resolved", visibleIds), "incident-open");
  assert.equal(resolveVisibleIncidentId("incident-open", []), null);
});

test("runtime, notifications, and incidents wire the shared identity and error contracts", async () => {
  const [runtimeSource, notificationSource, incidentSource] = await Promise.all([
    readFile("client/src/pages/runtime-monitoring.tsx", "utf8"),
    readFile("client/src/components/notification-bell.tsx", "utf8"),
    readFile("client/src/pages/incidents.tsx", "utf8"),
  ]);

  assert.match(runtimeSource, /buildIncidentHref\(runtimeResponse\?\.escalatedIncidentId\)/);
  assert.match(runtimeSource, /<Link href=\{escalatedIncidentHref\}>\s*Open incidents/);
  assert.match(notificationSource, /navigate\(buildIncidentHref\(notif\.entityId\)\)/);
  assert.match(notificationSource, /navigate\(buildIncidentHref\(incident\.id\)\)/);
  assert.match(incidentSource, /const locationSearch = useSearch\(\)/);
  assert.match(incidentSource, /resolveIncidentDeepLink\(requestedIncidentId, listQuery\.data\)/);
  assert.match(incidentSource, /resolveVisibleIncidentId\(selectedIncidentId, filteredIncidents\.map/);
  assert.match(notificationSource, /role="alert"/);
  assert.match(notificationSource, /notification data unavailable/);
});
