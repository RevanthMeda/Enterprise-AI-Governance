import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizationTelemetryAdapters } from "@shared/schema";
import { upstreamProviderVaultService } from "./upstreamProviderVaultService";

type TelemetryCollectionProfile = "minimal" | "redacted" | "full_evidence";

export type ResolvedTelemetryAdapter = Omit<
  typeof organizationTelemetryAdapters.$inferSelect,
  "collectionProfile" | "allowedGateways" | "allowedToolNames" | "toolArgumentPolicy" | "upstreamProviders"
> & {
  collectionProfile: TelemetryCollectionProfile;
  allowedGateways: string[];
  allowedToolNames: string[];
  toolArgumentPolicy: Record<string, unknown>;
  upstreamProviders: Record<string, unknown>;
};

function hashKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

function buildSdkKey() {
  return `actl_sdk_${randomBytes(18).toString("hex")}`;
}

type AdapterPatch = {
  enabled?: boolean;
  allowedGateways?: string[];
  allowedToolNames?: string[];
  toolArgumentPolicy?: Record<string, unknown>;
  upstreamProviders?: Record<string, unknown>;
  defaultSystemId?: string | null;
  collectionProfile?: TelemetryCollectionProfile;
};

function getObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCollectionProfile(value: unknown): TelemetryCollectionProfile {
  if (value === "minimal" || value === "redacted" || value === "full_evidence") {
    return value;
  }
  return "full_evidence";
}

export class TelemetryAdapterService {
  private normalizeAdapter(adapter: typeof organizationTelemetryAdapters.$inferSelect): ResolvedTelemetryAdapter {
    return {
      ...adapter,
      collectionProfile: normalizeCollectionProfile(adapter.collectionProfile),
      allowedGateways: Array.isArray(adapter.allowedGateways)
        ? adapter.allowedGateways.filter((entry): entry is string => typeof entry === "string")
        : [],
      allowedToolNames: Array.isArray(adapter.allowedToolNames)
        ? adapter.allowedToolNames.filter((entry): entry is string => typeof entry === "string")
        : [],
      toolArgumentPolicy: getObjectRecord(adapter.toolArgumentPolicy),
      upstreamProviders: getObjectRecord(adapter.upstreamProviders),
    };
  }

  private sanitize(adapter: typeof organizationTelemetryAdapters.$inferSelect) {
    const normalized = this.normalizeAdapter(adapter);

    return {
      id: normalized.id,
      organizationId: normalized.organizationId,
      enabled: normalized.enabled,
      hasActiveKey: Boolean(normalized.ingestKeyHash),
      keyPrefix: normalized.keyPrefix,
      defaultSystemId: normalized.defaultSystemId,
      collectionProfile: normalized.collectionProfile,
      allowedGateways: normalized.allowedGateways,
      allowedToolNames: normalized.allowedToolNames,
      toolArgumentPolicy: normalized.toolArgumentPolicy,
      upstreamProviders:
        upstreamProviderVaultService.sanitizeForClient(normalized.upstreamProviders),
      lastUsedAt: normalized.lastUsedAt,
      lastRotatedAt: normalized.lastRotatedAt,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
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
        defaultSystemId: null,
        collectionProfile: "full_evidence",
        allowedGateways: [],
        allowedToolNames: [],
        toolArgumentPolicy: {},
        upstreamProviders: {},
        lastUsedAt: null,
        lastRotatedAt: null,
        updatedAt: new Date(),
      })
      .returning();

    return this.sanitize(created);
  }

  async updateForOrg(organizationId: string, patch: AdapterPatch) {
    await this.getForOrg(organizationId);
    const [existing] = await db
      .select()
      .from(organizationTelemetryAdapters)
      .where(eq(organizationTelemetryAdapters.organizationId, organizationId))
      .limit(1);

    const [updated] = await db
      .update(organizationTelemetryAdapters)
      .set({
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.allowedGateways !== undefined ? { allowedGateways: patch.allowedGateways } : {}),
        ...(patch.allowedToolNames !== undefined ? { allowedToolNames: patch.allowedToolNames } : {}),
        ...(patch.toolArgumentPolicy !== undefined ? { toolArgumentPolicy: patch.toolArgumentPolicy } : {}),
        ...(patch.upstreamProviders !== undefined
          ? {
              upstreamProviders: upstreamProviderVaultService.mergeForStorage(
                existing?.upstreamProviders ?? {},
                patch.upstreamProviders,
              ),
            }
          : {}),
        ...(patch.defaultSystemId !== undefined ? { defaultSystemId: patch.defaultSystemId } : {}),
        ...(patch.collectionProfile !== undefined ? { collectionProfile: patch.collectionProfile } : {}),
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

    return this.normalizeAdapter(adapter);
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
