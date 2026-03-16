import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizationTelemetryAdapters } from "@shared/schema";

function hashKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

function buildSdkKey() {
  return `actl_sdk_${randomBytes(18).toString("hex")}`;
}

type AdapterPatch = {
  enabled?: boolean;
  allowedGateways?: string[];
};

export class TelemetryAdapterService {
  private sanitize(adapter: typeof organizationTelemetryAdapters.$inferSelect) {
    return {
      id: adapter.id,
      organizationId: adapter.organizationId,
      enabled: adapter.enabled,
      hasActiveKey: Boolean(adapter.ingestKeyHash),
      keyPrefix: adapter.keyPrefix,
      allowedGateways: Array.isArray(adapter.allowedGateways) ? adapter.allowedGateways : [],
      lastUsedAt: adapter.lastUsedAt,
      lastRotatedAt: adapter.lastRotatedAt,
      createdAt: adapter.createdAt,
      updatedAt: adapter.updatedAt,
      ingestPath: "/api/telemetry/sdk-ingest",
      evaluatePath: "/api/telemetry/sdk-evaluate",
      headerName: "x-telemetry-key",
    };
  }

  async getForOrg(organizationId: string) {
    const [existing] = await db
      .select()
      .from(organizationTelemetryAdapters)
      .where(eq(organizationTelemetryAdapters.organizationId, organizationId))
      .limit(1);

    if (existing) {
      return this.sanitize(existing);
    }

    const [created] = await db
      .insert(organizationTelemetryAdapters)
      .values({
        organizationId,
        enabled: true,
        ingestKeyHash: null,
        keyPrefix: null,
        allowedGateways: [],
        lastUsedAt: null,
        lastRotatedAt: null,
        updatedAt: new Date(),
      })
      .returning();

    return this.sanitize(created);
  }

  async updateForOrg(organizationId: string, patch: AdapterPatch) {
    await this.getForOrg(organizationId);

    const [updated] = await db
      .update(organizationTelemetryAdapters)
      .set({
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.allowedGateways !== undefined ? { allowedGateways: patch.allowedGateways } : {}),
        updatedAt: new Date(),
      })
      .where(eq(organizationTelemetryAdapters.organizationId, organizationId))
      .returning();

    return this.sanitize(updated);
  }

  async rotateKeyForOrg(organizationId: string) {
    await this.getForOrg(organizationId);

    const rawKey = buildSdkKey();
    const prefix = rawKey.slice(0, 18);

    const [updated] = await db
      .update(organizationTelemetryAdapters)
      .set({
        ingestKeyHash: hashKey(rawKey),
        keyPrefix: prefix,
        lastRotatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationTelemetryAdapters.organizationId, organizationId))
      .returning();

    return {
      adapter: this.sanitize(updated),
      plainTextKey: rawKey,
    };
  }

  async resolveIngestKey(rawKey: string) {
    const keyHash = hashKey(rawKey);
    const [adapter] = await db
      .select()
      .from(organizationTelemetryAdapters)
      .where(eq(organizationTelemetryAdapters.ingestKeyHash, keyHash))
      .limit(1);

    if (!adapter || !adapter.enabled) {
      return null;
    }

    return adapter;
  }

  async markUsed(adapterId: string) {
    await db
      .update(organizationTelemetryAdapters)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationTelemetryAdapters.id, adapterId));
  }
}

export const telemetryAdapterService = new TelemetryAdapterService();
