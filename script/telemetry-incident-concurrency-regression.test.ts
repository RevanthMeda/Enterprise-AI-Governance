import "../server/load-env";
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";

const hasDatabase = Boolean(process.env.DATABASE_URL);

function makeSuffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

async function closeServer(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test(
  "concurrent equivalent telemetry events atomically share one tenant-scoped active incident",
  { skip: hasDatabase ? false : "DATABASE_URL is not configured" },
  async () => {
    const [
      { db },
      { registerTelemetryRoutes },
      { storage },
      { telemetryAdapterService },
      { telemetryService },
      { auditService },
      schema,
    ] = await Promise.all([
      import("../server/db"),
      import("../server/routes/telemetry"),
      import("../server/storage"),
      import("../server/services/telemetryAdapterService"),
      import("../server/services/telemetryService"),
      import("../server/services/auditService"),
      import("../shared/schema"),
    ]);
    const {
      aiIncidents,
      aiTelemetryEvents,
      auditLogs,
      organizationTelemetryAdapters,
      organizations,
    } = schema;
    const suffix = makeSuffix();
    const organizationIds: string[] = [];
    const previousEnvironment = {
      threatIntelFeedUrl: process.env.THREAT_INTEL_FEED_URL,
      governanceCriticEnabled: process.env.AICT_GOVERNANCE_CRITIC_ENABLED,
      guardAlwaysOn: process.env.AICT_GUARD_LLM_ALWAYS_ON,
    };
    delete process.env.THREAT_INTEL_FEED_URL;
    process.env.AICT_GOVERNANCE_CRITIC_ENABLED = "false";
    process.env.AICT_GUARD_LLM_ALWAYS_ON = "false";

    let server: Server | undefined;

    try {
      const firstOrg = await storage.createOrganization({
        slug: `telemetry-incident-a-${suffix}`,
        name: `Telemetry Incident A ${suffix}`,
        status: "active",
        plan: "starter",
        settings: {},
      });
      organizationIds.push(firstOrg.id);
      const secondOrg = await storage.createOrganization({
        slug: `telemetry-incident-b-${suffix}`,
        name: `Telemetry Incident B ${suffix}`,
        status: "active",
        plan: "starter",
        settings: {},
      });
      organizationIds.push(secondOrg.id);

      const [firstKey, secondKey] = await Promise.all([
        telemetryAdapterService.rotateKeyForOrg(firstOrg.id),
        telemetryAdapterService.rotateKeyForOrg(secondOrg.id),
      ]);

      const app = express();
      app.use(express.json());
      registerTelemetryRoutes(app);
      server = createServer(app);
      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(0, "127.0.0.1", () => resolve());
      });
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const postSdkEvent = async (
        key: string,
        payload: { eventType: string; correlationId: string; summary: string },
      ) => {
        const response = await fetch(`${baseUrl}/api/telemetry/sdk-ingest`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-telemetry-key": key,
          },
          body: JSON.stringify({
            ...payload,
            gateway: "concurrency-regression-gateway",
            severity: "critical",
            safetySignals: ["concurrency-regression"],
          }),
        });
        const body = await response.json();
        return { status: response.status, body } as {
          status: number;
          body: { id: string; escalatedIncidentId: string | null };
        };
      };

      const sharedEventType = `runtime.concurrent-critical.${suffix}`;
      const sharedCorrelationId = `shared-correlation-${suffix}`;
      const concurrentResponses = await Promise.all([
        postSdkEvent(firstKey.plainTextKey, {
          eventType: sharedEventType,
          correlationId: sharedCorrelationId,
          summary: "First concurrent copy of one critical runtime incident",
        }),
        postSdkEvent(firstKey.plainTextKey, {
          eventType: sharedEventType,
          correlationId: sharedCorrelationId,
          summary: "Second concurrent copy of one critical runtime incident",
        }),
      ]);

      assert.deepEqual(concurrentResponses.map((response) => response.status), [201, 201]);
      const [firstResponse, secondResponse] = concurrentResponses.map((response) => response.body);
      assert.notEqual(firstResponse.id, secondResponse.id);
      assert.ok(firstResponse.escalatedIncidentId);
      assert.equal(firstResponse.escalatedIncidentId, secondResponse.escalatedIncidentId);

      const concurrentEvents = await db
        .select()
        .from(aiTelemetryEvents)
        .where(
          and(
            eq(aiTelemetryEvents.organizationId, firstOrg.id),
            eq(aiTelemetryEvents.eventType, sharedEventType),
          ),
        );
      assert.equal(concurrentEvents.length, 2);
      assert.deepEqual(
        new Set(
          concurrentEvents.map((event) =>
            (event.metadata as Record<string, unknown>).escalatedIncidentId,
          ),
        ),
        new Set([firstResponse.escalatedIncidentId]),
      );

      const sharedIncidents = await db
        .select()
        .from(aiIncidents)
        .where(
          and(
            eq(aiIncidents.organizationId, firstOrg.id),
            eq(aiIncidents.title, `Telemetry threshold breach: ${sharedEventType}`),
            inArray(aiIncidents.status, ["open", "contained"]),
          ),
        );
      assert.equal(sharedIncidents.length, 1);
      assert.equal(sharedIncidents[0].id, firstResponse.escalatedIncidentId);

      const eventAuditRows = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, firstOrg.id),
            eq(auditLogs.entityType, "telemetry_event"),
            eq(auditLogs.action, "sdk_ingested"),
          ),
        );
      assert.equal(eventAuditRows.length, 2);
      assert.deepEqual(
        new Set(eventAuditRows.map((row) => row.entityId)),
        new Set([firstResponse.id, secondResponse.id]),
      );

      const distinctResponse = await postSdkEvent(firstKey.plainTextKey, {
        eventType: `${sharedEventType}.distinct`,
        correlationId: sharedCorrelationId,
        summary: "A distinct critical event must create its own incident",
      });
      assert.equal(distinctResponse.status, 201);
      assert.ok(distinctResponse.body.escalatedIncidentId);
      assert.notEqual(distinctResponse.body.escalatedIncidentId, firstResponse.escalatedIncidentId);

      const otherOrgResponse = await postSdkEvent(secondKey.plainTextKey, {
        eventType: sharedEventType,
        correlationId: sharedCorrelationId,
        summary: "The same signal in another tenant must remain isolated",
      });
      assert.equal(otherOrgResponse.status, 201);
      assert.ok(otherOrgResponse.body.escalatedIncidentId);
      assert.notEqual(otherOrgResponse.body.escalatedIncidentId, firstResponse.escalatedIncidentId);
      const otherOrgIncidents = await db
        .select()
        .from(aiIncidents)
        .where(eq(aiIncidents.organizationId, secondOrg.id));
      assert.equal(otherOrgIncidents.length, 1);

      const rollbackCorrelationId = `rollback-correlation-${suffix}`;
      await assert.rejects(
        telemetryService.createForOrg(
          firstOrg.id,
          {
            systemId: null,
            eventType: `${sharedEventType}.rollback`,
            severity: "critical",
            safetySignals: ["concurrency-regression"],
            summary: "This event must roll back with its incident when audit creation fails",
            correlationId: rollbackCorrelationId,
            metadata: {},
          },
          {
            collectionProfile: "full_evidence",
            audit: {
              actor: {
                id: "telemetry-integrity-test",
                username: "telemetry_integrity_test",
                fullName: "Telemetry Integrity Test",
                email: null,
                role: "system",
              },
              action: "integrity_test",
              performedBy: "Telemetry Integrity Test",
              buildDetails: () => {
                throw new Error("forced audit failure");
              },
            },
          },
        ),
        /forced audit failure/,
      );
      const rolledBackEvents = await db
        .select()
        .from(aiTelemetryEvents)
        .where(
          and(
            eq(aiTelemetryEvents.organizationId, firstOrg.id),
            eq(aiTelemetryEvents.correlationId, rollbackCorrelationId),
          ),
        );
      const rolledBackIncidents = await db
        .select()
        .from(aiIncidents)
        .where(
          and(
            eq(aiIncidents.organizationId, firstOrg.id),
            eq(aiIncidents.title, `Telemetry threshold breach: ${sharedEventType}.rollback`),
          ),
        );
      assert.equal(rolledBackEvents.length, 0);
      assert.equal(rolledBackIncidents.length, 0);

      const chain = await auditService.verifyChain({
        organizationId: firstOrg.id,
        actor: {
          id: "telemetry-integrity-test",
          username: "telemetry_integrity_test",
          fullName: "Telemetry Integrity Test",
          email: null,
          role: "system",
        },
      });
      assert.equal(chain.verified, true);
    } finally {
      try {
        await closeServer(server);
        if (organizationIds.length > 0) {
          await db.delete(auditLogs).where(inArray(auditLogs.organizationId, organizationIds));
          await db.delete(aiTelemetryEvents).where(inArray(aiTelemetryEvents.organizationId, organizationIds));
          await db.delete(aiIncidents).where(inArray(aiIncidents.organizationId, organizationIds));
          await db
            .delete(organizationTelemetryAdapters)
            .where(inArray(organizationTelemetryAdapters.organizationId, organizationIds));
          await db.delete(organizations).where(inArray(organizations.id, organizationIds));
        }
      } finally {
        if (previousEnvironment.threatIntelFeedUrl === undefined) {
          delete process.env.THREAT_INTEL_FEED_URL;
        } else {
          process.env.THREAT_INTEL_FEED_URL = previousEnvironment.threatIntelFeedUrl;
        }
        if (previousEnvironment.governanceCriticEnabled === undefined) {
          delete process.env.AICT_GOVERNANCE_CRITIC_ENABLED;
        } else {
          process.env.AICT_GOVERNANCE_CRITIC_ENABLED = previousEnvironment.governanceCriticEnabled;
        }
        if (previousEnvironment.guardAlwaysOn === undefined) {
          delete process.env.AICT_GUARD_LLM_ALWAYS_ON;
        } else {
          process.env.AICT_GUARD_LLM_ALWAYS_ON = previousEnvironment.guardAlwaysOn;
        }
      }
    }
  },
);
