import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { storage } from "../storage";
import { auditService } from "../services/auditService";
import { telemetryService } from "../services/telemetryService";
import { telemetryAdapterService } from "../services/telemetryAdapterService";
import { telemetryPolicyService } from "../services/telemetryPolicyService";
import { telemetryPolicyAdvisorService } from "../services/telemetryPolicyAdvisorService";
import { telemetryReviewerExceptionService } from "../services/telemetryReviewerExceptionService";
import { controlTowerGatewayService } from "../services/controlTowerGatewayService";
import { upstreamProviderVaultService } from "../services/upstreamProviderVaultService";
import { buildTelemetryAuditDetails, getErrorStatus, routeParam, recordAdminAuditEvent } from "./_helpers";
import { z } from "zod";

const telemetryEventPayloadSchema = z.object({
  systemId: z.string().trim().max(120).optional().nullable(),
  modelName: z.string().trim().max(200).optional().nullable(),
  provider: z.string().trim().max(120).optional().nullable(),
  gateway: z.string().trim().max(200).optional().nullable(),
  eventType: z.string().trim().min(1).max(120),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  driftScore: z.number().int().min(0).max(100).optional().nullable(),
  biasFlags: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  safetySignals: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  toxicityScore: z.number().int().min(0).max(100).optional().nullable(),
  piiFlags: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  promptText: z.string().trim().max(20000).optional().nullable(),
  modelOutput: z.string().trim().max(40000).optional().nullable(),
  runtimeContext: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().trim().max(200).optional().nullable(),
  summary: z.string().trim().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  detectedAt: z.coerce.date().optional(),
});

const telemetryPolicyPatchSchema = z.object({
  driftAlertThreshold: z.number().int().min(1).max(100).optional(),
  driftCriticalThreshold: z.number().int().min(1).max(100).optional(),
  biasFlagThreshold: z.number().int().min(1).max(20).optional(),
  safetyFlagThreshold: z.number().int().min(1).max(20).optional(),
  toxicityWarningThreshold: z.number().int().min(1).max(100).optional(),
  toxicityCriticalThreshold: z.number().int().min(1).max(100).optional(),
  piiFlagThreshold: z.number().int().min(1).max(20).optional(),
  overrideRateWarningThreshold: z.number().int().min(1).max(100).optional(),
  overrideRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
  errorRateWarningThreshold: z.number().int().min(1).max(100).optional(),
  errorRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
  autoEscalateCritical: z.boolean().optional(),
  notifyOnWarning: z.boolean().optional(),
  enforceBlocking: z.boolean().optional(),
  blockOnPii: z.boolean().optional(),
  blockOnSafetyCritical: z.boolean().optional(),
  blockOnRestrictedPrompt: z.boolean().optional(),
  restrictedPromptPatterns: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  shadowModeEnabled: z.boolean().optional(),
  shadowModeLabel: z.string().trim().min(1).max(120).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one telemetry threshold setting must be provided",
});

const telemetryActionReceiptSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(["completed", "failed", "pending"]).default("completed"),
  toolName: z.string().trim().max(120).optional().nullable(),
  receiptId: z.string().trim().max(200).optional().nullable(),
  performedBy: z.string().trim().max(200).optional().nullable(),
  performedAt: z.string().trim().datetime().optional().nullable(),
  details: z.string().trim().max(2000).optional().nullable(),
});

const telemetryReviewerReleaseSchema = z.object({
  reviewerNote: z.string().trim().min(5).max(2000),
  receipts: z.array(telemetryActionReceiptSchema).max(20).optional().default([]),
});

const telemetryActionReceiptBatchSchema = z.object({
  receipts: z.array(telemetryActionReceiptSchema).min(1).max(20),
});

const telemetryAdapterPatchSchema = z.object({
  enabled: z.boolean().optional(),
  allowedGateways: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  allowedToolNames: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  toolArgumentPolicy: z.record(
    z.string().trim().min(1).max(120),
    z.object({
      allowedArgumentKeys: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
      blockedArgumentKeys: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
      blockedValuePatterns: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      maxStringLength: z.number().int().min(1).max(20000).optional(),
      argumentSchema: z.record(
        z.string().trim().min(1).max(200),
        z.object({
          type: z.enum(["string", "number", "boolean", "object", "array"]).optional(),
          required: z.boolean().optional(),
          enumValues: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
          minLength: z.number().int().min(0).max(20000).optional(),
          maxLength: z.number().int().min(1).max(20000).optional(),
          minimum: z.number().optional(),
          maximum: z.number().optional(),
        }),
      ).optional(),
    }),
  ).optional(),
  upstreamProviders: z.object({
    openai: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    anthropic: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    gemini: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    azureOpenAi: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      apiVersion: z.string().trim().max(120).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    vertexAi: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    bedrock: z.object({
      enabled: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      region: z.string().trim().max(120).nullable().optional(),
      accessKeyId: z.string().trim().max(4000).nullable().optional(),
      secretAccessKey: z.string().trim().max(4000).nullable().optional(),
      sessionToken: z.string().trim().max(8000).nullable().optional(),
      clearStoredAwsCredentials: z.boolean().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    compatibleProviders: z.record(
      z.string().trim().min(1).max(120),
      z.object({
        enabled: z.boolean().optional(),
        apiKey: z.string().trim().max(4000).nullable().optional(),
        clearStoredApiKey: z.boolean().optional(),
        baseUrl: z.string().trim().url().max(1000).nullable().optional(),
        headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
        modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      }),
    ).optional(),
  }).optional(),
  defaultSystemId: z.string().trim().min(1).max(120).nullable().optional(),
  collectionProfile: z.enum(["minimal", "redacted", "full_evidence"]).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one telemetry adapter setting must be provided",
});

const telemetryReviewerThresholdNames = [
  "drift_gt_5_percent",
  "bias_flags_detected",
  "safety_flags_detected",
  "toxicity_warning",
  "pii_detected",
  "override_rate_spike",
  "error_rate_anomaly",
  "restricted_prompt_detected",
] as const;

const telemetryReviewerExceptionSchema = z.object({
  systemId: z.string().trim().min(1).max(120).nullable().optional(),
  gateway: z.string().trim().min(1).max(120).nullable().optional(),
  promptPattern: z.string().trim().min(3).max(1000),
  suppressedThresholds: z.array(z.enum(telemetryReviewerThresholdNames)).max(20).optional(),
  reviewerNote: z.string().trim().min(3).max(4000),
  active: z.boolean().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

const telemetryReviewerExceptionPatchSchema = z.object({
  gateway: z.string().trim().min(1).max(120).nullable().optional(),
  promptPattern: z.string().trim().min(3).max(1000).optional(),
  suppressedThresholds: z.array(z.enum(telemetryReviewerThresholdNames)).max(20).optional(),
  reviewerNote: z.string().trim().min(3).max(4000).optional(),
  active: z.boolean().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one exception field must be provided",
});

const telemetryPolicyAssistSchema = z.object({
  intent: z.string().min(8).max(4000),
  systemId: z.string().uuid().nullable().optional(),
});

const telemetryPolicyImpactSchema = z.object({
  systemId: z.string().uuid().nullable().optional(),
  patch: z
    .object({
      driftAlertThreshold: z.number().int().min(1).max(100).optional(),
      driftCriticalThreshold: z.number().int().min(1).max(100).optional(),
      biasFlagThreshold: z.number().int().min(1).max(100).optional(),
      safetyFlagThreshold: z.number().int().min(1).max(100).optional(),
      toxicityWarningThreshold: z.number().int().min(1).max(100).optional(),
      toxicityCriticalThreshold: z.number().int().min(1).max(100).optional(),
      piiFlagThreshold: z.number().int().min(1).max(100).optional(),
      overrideRateWarningThreshold: z.number().int().min(1).max(100).optional(),
      overrideRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
      errorRateWarningThreshold: z.number().int().min(1).max(100).optional(),
      errorRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
      autoEscalateCritical: z.boolean().optional(),
      notifyOnWarning: z.boolean().optional(),
      enforceBlocking: z.boolean().optional(),
      blockOnPii: z.boolean().optional(),
      blockOnSafetyCritical: z.boolean().optional(),
      blockOnRestrictedPrompt: z.boolean().optional(),
      restrictedPromptPatterns: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
      shadowModeEnabled: z.boolean().optional(),
      shadowModeLabel: z.string().trim().min(1).max(80).optional(),
    })
    .default({}),
});

export function registerTelemetryRoutes(app: Express): void {
  app.get(
    "/api/telemetry/summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const summary = await telemetryService.getSummaryForOrg(req.tenant!.organizationId);
      res.json(summary);
    },
  );

  app.post(
    ["/api/telemetry/events", "/api/telemetry/ingest"],
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryEventPayloadSchema.parse(req.body);
        const created = await telemetryService.createForOrg(req.tenant!.organizationId, {
          ...parsed,
          systemId: parsed.systemId ?? null,
          modelName: parsed.modelName ?? null,
          provider: parsed.provider ?? null,
          gateway: parsed.gateway ?? null,
          driftScore: parsed.driftScore ?? null,
          biasFlags: parsed.biasFlags ?? [],
          safetySignals: parsed.safetySignals ?? [],
          toxicityScore: parsed.toxicityScore ?? null,
          piiFlags: parsed.piiFlags ?? [],
          promptText: parsed.promptText ?? null,
          modelOutput: parsed.modelOutput ?? null,
          runtimeContext: parsed.runtimeContext ?? {},
          correlationId: parsed.correlationId ?? null,
          metadata: parsed.metadata ?? {},
          detectedAt: parsed.detectedAt ?? new Date(),
        }, {
          collectionProfile: "full_evidence",
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_event",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: buildTelemetryAuditDetails({
              sourceLabel: "Telemetry event",
              eventType: created.eventType,
              decision: created.actionTaken,
              metadata: created.metadata,
            }),
          },
        });
        res.status(201).json(created);
      } catch (err: any) {
        res.status(getErrorStatus(err)).json({ message: err.message || "Failed to record telemetry event" });
      }
    },
  );

  app.post(
    "/api/telemetry/events/:id/action-receipts",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryActionReceiptBatchSchema.parse(req.body ?? {});
        const updated = await telemetryService.addActionReceiptsForOrg({
          organizationId: req.tenant!.organizationId,
          eventId: routeParam(req.params.id),
          actor: req.user!,
          receipts: parsed.receipts.map((receipt) => ({
            name: receipt.name,
            status: receipt.status,
            toolName: receipt.toolName ?? null,
            receiptId: receipt.receiptId ?? null,
            details: receipt.details ?? null,
            performedAt: receipt.performedAt ?? new Date().toISOString(),
            performedBy: receipt.performedBy ?? req.user!.fullName ?? req.user!.username,
          })),
        });
        if (!updated) {
          return res.status(404).json({ message: "Telemetry event not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_event",
            entityId: updated.id,
            action: "action_receipts_added",
            performedBy: req.user!.fullName,
            details: `Added ${parsed.receipts.length} action receipt${parsed.receipts.length === 1 ? "" : "s"} to telemetry event ${updated.id}`,
          },
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(getErrorStatus(err)).json({ message: err.message || "Failed to append action receipts" });
      }
    },
  );

  app.post(
    "/api/telemetry/events/:id/reviewer-release",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryReviewerReleaseSchema.parse(req.body ?? {});
        const updated = await telemetryService.releaseEscalatedEventForOrg({
          organizationId: req.tenant!.organizationId,
          eventId: routeParam(req.params.id),
          actor: req.user!,
          reviewerNote: parsed.reviewerNote,
          receipts: parsed.receipts.map((receipt) => ({
            name: receipt.name,
            status: receipt.status,
            toolName: receipt.toolName ?? null,
            receiptId: receipt.receiptId ?? null,
            details: receipt.details ?? null,
            performedAt: receipt.performedAt ?? new Date().toISOString(),
            performedBy: receipt.performedBy ?? req.user!.fullName ?? req.user!.username,
          })),
        });
        if (!updated) {
          return res.status(404).json({ message: "Telemetry event not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_event",
            entityId: updated.id,
            action: "reviewer_released",
            performedBy: req.user!.fullName,
            details: `Escalated telemetry event released by reviewer. ${parsed.reviewerNote}`,
          },
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(getErrorStatus(err)).json({ message: err.message || "Failed to reviewer-release telemetry event" });
      }
    },
  );

  app.post(["/api/telemetry/sdk-ingest", "/api/telemetry/sdk-evaluate"], async (req, res) => {
    try {
      const rawKey =
        req.get("x-telemetry-key") ||
        req.get("x-api-key") ||
        req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      if (!rawKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const parsed = telemetryEventPayloadSchema.parse(req.body);
      const allowedGateways = Array.isArray(adapter.allowedGateways)
        ? adapter.allowedGateways.filter((entry): entry is string => typeof entry === "string")
        : [];

      if (allowedGateways.length > 0 && (!parsed.gateway || !allowedGateways.includes(parsed.gateway))) {
        return res.status(403).json({ message: "Gateway is not allowed for this telemetry adapter" });
      }

      const created = await telemetryService.createForOrg(adapter.organizationId, {
        ...parsed,
        systemId: parsed.systemId ?? adapter.defaultSystemId ?? null,
        modelName: parsed.modelName ?? null,
        provider: parsed.provider ?? null,
        gateway: parsed.gateway ?? null,
        driftScore: parsed.driftScore ?? null,
        biasFlags: parsed.biasFlags ?? [],
        safetySignals: parsed.safetySignals ?? [],
        toxicityScore: parsed.toxicityScore ?? null,
        piiFlags: parsed.piiFlags ?? [],
        promptText: parsed.promptText ?? null,
        modelOutput: parsed.modelOutput ?? null,
        runtimeContext: parsed.runtimeContext ?? {},
        correlationId: parsed.correlationId ?? null,
        metadata: {
          ...(parsed.metadata ?? {}),
          adapterKeyPrefix: adapter.keyPrefix,
          ingestSource: "sdk",
          boundSystemId: adapter.defaultSystemId ?? null,
        },
        detectedAt: parsed.detectedAt ?? new Date(),
      }, {
        collectionProfile: adapter.collectionProfile ?? "full_evidence",
      });

      await telemetryAdapterService.markUsed(adapter.id);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "telemetry-sdk",
          username: "telemetry-sdk",
          fullName: "Telemetry SDK",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: created.id,
          action: "sdk_ingested",
          performedBy: "Telemetry SDK",
          details: buildTelemetryAuditDetails({
            sourceLabel: "Telemetry SDK event",
            eventType: created.eventType,
            gateway: parsed.gateway ?? null,
            decision: created.actionTaken,
            metadata: created.metadata,
          }),
        },
      });

      const metadata = created.metadata as Record<string, unknown>;
      return res.status(201).json({
        id: created.id,
        ok: true,
        decision: created.actionTaken,
        blocked: created.blocked,
        thresholdBreaches: Array.isArray(metadata?.thresholdBreaches)
          ? (metadata.thresholdBreaches as string[])
          : [],
        escalatedIncidentId:
          typeof metadata?.escalatedIncidentId === "string" ? metadata.escalatedIncidentId : null,
        restrictedPromptMatches: Array.isArray(metadata?.restrictedPromptMatches)
          ? (metadata.restrictedPromptMatches as string[])
          : [],
        reasonCodes: Array.isArray(metadata?.reasonCodes)
          ? (metadata.reasonCodes as string[])
          : [],
        decisionSummary:
          typeof metadata?.decisionSummary === "string" ? metadata.decisionSummary : null,
        legalProfileApplied:
          typeof metadata?.legalProfileApplied === "string" ? metadata.legalProfileApplied : null,
        lawPackIdsApplied: Array.isArray(metadata?.lawPackIdsApplied)
          ? (metadata.lawPackIdsApplied as string[])
          : [],
        capabilityProfileApplied:
          typeof metadata?.capabilityProfileApplied === "string" ? metadata.capabilityProfileApplied : null,
        allowedCapabilitiesApplied: Array.isArray(metadata?.allowedCapabilitiesApplied)
          ? (metadata.allowedCapabilitiesApplied as string[])
          : [],
        strictnessApplied:
          typeof metadata?.strictnessApplied === "string" ? metadata.strictnessApplied : null,
        policyCategories: Array.isArray(metadata?.policyCategories)
          ? (metadata.policyCategories as string[])
          : [],
        policyLayers: Array.isArray(metadata?.policyLayers)
          ? (metadata.policyLayers as string[])
          : [],
        alwaysLogPolicyCategories: Array.isArray(metadata?.alwaysLogPolicyCategories)
          ? (metadata.alwaysLogPolicyCategories as string[])
          : [],
        requestedCapabilities: Array.isArray(metadata?.requestedCapabilities)
          ? (metadata.requestedCapabilities as string[])
          : [],
        outOfScopeCapabilities: Array.isArray(metadata?.outOfScopeCapabilities)
          ? (metadata.outOfScopeCapabilities as string[])
          : [],
        rulesEngine:
          metadata?.rulesEngine && typeof metadata.rulesEngine === "object" && !Array.isArray(metadata.rulesEngine)
            ? metadata.rulesEngine
            : null,
        governanceCritic:
          metadata?.governanceCritic && typeof metadata.governanceCritic === "object" && !Array.isArray(metadata.governanceCritic)
            ? metadata.governanceCritic
            : null,
        sourceAttributionVerifier:
          metadata?.sourceAttributionVerifier &&
          typeof metadata.sourceAttributionVerifier === "object" &&
          !Array.isArray(metadata.sourceAttributionVerifier)
            ? metadata.sourceAttributionVerifier
            : null,
        factProvenanceVerifier:
          metadata?.factProvenanceVerifier &&
          typeof metadata.factProvenanceVerifier === "object" &&
          !Array.isArray(metadata.factProvenanceVerifier)
            ? metadata.factProvenanceVerifier
            : null,
        actionConfirmationVerifier:
          metadata?.actionConfirmationVerifier &&
          typeof metadata.actionConfirmationVerifier === "object" &&
          !Array.isArray(metadata.actionConfirmationVerifier)
            ? metadata.actionConfirmationVerifier
            : null,
        reviewRelease:
          metadata?.reviewRelease &&
          typeof metadata.reviewRelease === "object" &&
          !Array.isArray(metadata.reviewRelease)
            ? metadata.reviewRelease
            : null,
        shadowPolicy:
          metadata?.shadowPolicy &&
          typeof metadata.shadowPolicy === "object" &&
          !Array.isArray(metadata.shadowPolicy)
            ? metadata.shadowPolicy
            : null,
        governanceCatalog:
          metadata?.governanceCatalog &&
          typeof metadata.governanceCatalog === "object" &&
          !Array.isArray(metadata.governanceCatalog)
            ? metadata.governanceCatalog
            : null,
        guard:
          metadata?.guard && typeof metadata.guard === "object" && !Array.isArray(metadata.guard)
            ? metadata.guard
            : null,
      });
    } catch (err: any) {
      return res.status(getErrorStatus(err)).json({ message: err.message || "Failed to ingest telemetry event" });
    }
  });

  app.post("/api/gateway/openai/v1/chat/completions", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const explicitApiKey =
        req.get("x-openai-api-key") ||
        req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "OpenAI chat completions payload must include model and messages" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "openai",
        {
          requestApiKey: explicitApiKey,
          requestBaseUrl: req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiChatCompletions(
        adapter,
        requestBody,
        upstreamConfig,
      );

      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        await auditService.createLog({
          organizationId: adapter.organizationId,
          actor: {
            id: "control-grid-gateway",
            username: "control-grid-gateway",
            fullName: "Control Grid Gateway",
            email: null,
            role: "system",
          },
          input: {
            entityType: "telemetry_event",
            entityId: decision.id,
            action: "gateway_blocked",
            performedBy: "Control Grid Gateway",
            details: `OpenAI chat completion blocked at ${result.stage} stage with decision "${decision.decision}"`,
          },
        });
        return res.status(403).json({
          ok: false,
          stage: result.stage,
          correlationId: result.correlationId,
          ...decision,
        });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `OpenAI chat completion proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/openai/v1/responses", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const explicitApiKey =
        req.get("x-openai-api-key") ||
        req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || requestBody.input === undefined) {
        return res.status(400).json({ message: "OpenAI responses payload must include model and input" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "openai",
        {
          requestApiKey: explicitApiKey,
          requestBaseUrl: req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiResponses(
        adapter,
        requestBody,
        upstreamConfig,
      );

      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        await auditService.createLog({
          organizationId: adapter.organizationId,
          actor: {
            id: "control-grid-gateway",
            username: "control-grid-gateway",
            fullName: "Control Grid Gateway",
            email: null,
            role: "system",
          },
          input: {
            entityType: "telemetry_event",
            entityId: decision.id,
            action: "gateway_blocked",
            performedBy: "Control Grid Gateway",
            details: `OpenAI response blocked at ${result.stage} stage with decision "${decision.decision}"`,
          },
        });
        return res.status(403).json({
          ok: false,
          stage: result.stage,
          correlationId: result.correlationId,
          ...decision,
        });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `OpenAI response proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/anthropic/v1/messages", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "Anthropic messages payload must include model and messages" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "anthropic",
        {
          requestApiKey:
            req.get("x-anthropic-api-key") ||
            req.get("x-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-anthropic-base-url"),
          requestHeaders: req.get("anthropic-version")
            ? { "anthropic-version": req.get("anthropic-version")! }
            : undefined,
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyAnthropicMessages(adapter, requestBody, upstreamConfig);
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `Anthropic message proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/gemini/v1beta/models/:modelAction", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const [modelName, action] = String(req.params.modelAction || "").split(":");
      if (!modelName || action !== "generateContent") {
        return res.status(404).json({ message: "Unsupported Gemini gateway route" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.contents)) {
        return res.status(400).json({ message: "Gemini generateContent payload must include contents" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "gemini",
        {
          requestApiKey:
            req.get("x-gemini-api-key") ||
            req.get("x-goog-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-gemini-base-url") || req.get("x-google-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, modelName);

      const result = await controlTowerGatewayService.proxyGeminiGenerateContent(
        adapter,
        requestBody,
        modelName,
        upstreamConfig,
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `Gemini generateContent proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/azure-openai/openai/deployments/:deployment/chat/completions", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const deployment = routeParam(req.params.deployment);
      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "Azure OpenAI payload must include messages" });
      }

      const apiVersion =
        typeof req.query["api-version"] === "string"
          ? req.query["api-version"]
          : typeof req.query.apiVersion === "string"
            ? req.query.apiVersion
            : req.get("x-azure-openai-api-version") || undefined;
      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "azureOpenAi",
        {
          protocol: "azure_openai",
          requestApiKey: req.get("x-azure-openai-api-key") || req.get("api-key") || "",
          requestBaseUrl: req.get("x-azure-openai-base-url"),
          requestApiVersion: apiVersion,
        },
      );

      const normalizedBody = {
        ...requestBody,
        model: typeof requestBody.model === "string" ? requestBody.model : deployment,
      };
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, normalizedBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiChatCompletions(
        adapter,
        normalizedBody,
        upstreamConfig,
        {
          upstreamPath: `/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(upstreamConfig.apiVersion ?? "2024-10-21")}`,
          gatewayFallback: "azure-openai-inline-gateway",
        },
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `Azure OpenAI chat completion proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/vertex-ai/v1/projects/:projectId/locations/:location/publishers/:publisher/models/:modelAction", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const [modelName, action] = String(req.params.modelAction || "").split(":");
      if (!modelName || action !== "generateContent") {
        return res.status(404).json({ message: "Unsupported Vertex AI gateway route" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.contents)) {
        return res.status(400).json({ message: "Vertex AI generateContent payload must include contents" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "vertexAi",
        {
          protocol: "vertex_ai",
          requestApiKey:
            req.get("x-vertex-ai-access-token") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-vertex-ai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, modelName);

      const result = await controlTowerGatewayService.proxyGeminiGenerateContent(
        adapter,
        requestBody,
        modelName,
        upstreamConfig,
        {
          upstreamPath:
            `${upstreamConfig.baseUrl}/v1/projects/${encodeURIComponent(routeParam(req.params.projectId))}` +
            `/locations/${encodeURIComponent(routeParam(req.params.location))}` +
            `/publishers/${encodeURIComponent(routeParam(req.params.publisher))}` +
            `/models/${encodeURIComponent(modelName)}:generateContent`,
          gatewayFallback: "vertex-ai-inline-gateway",
        },
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `Vertex AI generateContent proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/bedrock/:region/model/:modelId/converse", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "Bedrock Converse payload must include messages" });
      }

      const region = routeParam(req.params.region);
      const modelId = routeParam(req.params.modelId);
      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "bedrock",
        {
          protocol: "bedrock",
          requestBaseUrl: req.get("x-bedrock-base-url"),
          requestRegion: region,
          requestAccessKeyId: req.get("x-aws-access-key-id"),
          requestSecretAccessKey: req.get("x-aws-secret-access-key"),
          requestSessionToken: req.get("x-aws-session-token"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, modelId);

      const result = await controlTowerGatewayService.proxyBedrockConverse(
        adapter,
        requestBody,
        modelId,
        upstreamConfig,
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `Bedrock Converse proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/providers/:provider/v1/chat/completions", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const providerName = routeParam(req.params.provider).toLowerCase();
      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "OpenAI-compatible payload must include model and messages" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        providerName,
        {
          protocol: "openai",
          requestApiKey:
            req.get("x-provider-api-key") ||
            req.get("x-openai-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-provider-base-url") || req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiChatCompletions(adapter, requestBody, upstreamConfig);
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `${providerName} chat completion proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/providers/:provider/v1/responses", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const providerName = routeParam(req.params.provider).toLowerCase();
      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || requestBody.input === undefined) {
        return res.status(400).json({ message: "OpenAI-compatible payload must include model and input" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        providerName,
        {
          protocol: "openai",
          requestApiKey:
            req.get("x-provider-api-key") ||
            req.get("x-openai-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-provider-base-url") || req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiResponses(adapter, requestBody, upstreamConfig);
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-grid-gateway",
          username: "control-grid-gateway",
          fullName: "Control Grid Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Grid Gateway",
          details: `${providerName} response proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  // Telemetry policy routes (org-level)
  app.get(
    "/api/organization/telemetry-policy",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const policy = await telemetryPolicyService.getEffectiveForOrg(req.tenant!.organizationId);
      return res.json(policy);
    },
  );

  app.patch(
    "/api/organization/telemetry-policy",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = telemetryPolicyPatchSchema.parse(req.body);
        const updated = await telemetryPolicyService.updateForOrg(req.tenant!.organizationId, parsed);
        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "organization.telemetry_policy.updated",
          targetType: "telemetry_policy",
          targetId: updated.id,
          metadata: parsed,
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update telemetry policy" });
      }
    },
  );

  app.post(
    "/api/organization/telemetry-policy/reset",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const updated = await telemetryPolicyService.resetOrgOverride(req.tenant!.organizationId);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.telemetry_policy.reset",
        targetType: "telemetry_policy",
        targetId: req.tenant!.organizationId,
        metadata: {
          source: updated.source,
          inheritedFromPortfolioId: updated.inheritedFromPortfolioId,
        },
      });
      return res.json(updated);
    },
  );

  // System-level telemetry policy routes
  app.get(
    "/api/ai-systems/:id/telemetry-policy",
    requireAuth,
    requireTenant,
    async (req, res) => {
      const systemId = routeParam(req.params.id);
      const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
      if (!system) {
        return res.status(404).json({ message: "AI system not found" });
      }

      const policy = await telemetryPolicyService.getEffectiveForSystem(req.tenant!.organizationId, systemId);
      return res.json(policy);
    },
  );

  app.patch(
    "/api/ai-systems/:id/telemetry-policy",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const systemId = routeParam(req.params.id);
        const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
        if (!system) {
          return res.status(404).json({ message: "AI system not found" });
        }

        const parsed = telemetryPolicyPatchSchema.parse(req.body);
        const updated = await telemetryPolicyService.updateForSystem(req.tenant!.organizationId, systemId, parsed);
        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "system.telemetry_policy.updated",
          targetType: "ai_system",
          targetId: systemId,
          metadata: {
            systemName: system.name,
            ...parsed,
          },
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update system telemetry policy" });
      }
    },
  );

  app.post(
    "/api/ai-systems/:id/telemetry-policy/reset",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      const systemId = routeParam(req.params.id);
      const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
      if (!system) {
        return res.status(404).json({ message: "AI system not found" });
      }

      const updated = await telemetryPolicyService.resetSystemOverride(req.tenant!.organizationId, systemId);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "system.telemetry_policy.reset",
        targetType: "ai_system",
        targetId: systemId,
        metadata: {
          systemName: system.name,
          source: updated.source,
        },
      });
      return res.json(updated);
    },
  );

  // Telemetry adapter routes
  app.get(
    "/api/organization/telemetry-adapter",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const adapter = await telemetryAdapterService.getForOrg(req.tenant!.organizationId);
      return res.json(adapter);
    },
  );

  app.patch(
    "/api/organization/telemetry-adapter",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = telemetryAdapterPatchSchema.parse(req.body);
        if (parsed.defaultSystemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, parsed.defaultSystemId);
          if (!system) {
            return res.status(404).json({ message: "Default AI system not found for this organization" });
          }
        }
        const updated = await telemetryAdapterService.updateForOrg(req.tenant!.organizationId, parsed);
        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "organization.telemetry_adapter.updated",
          targetType: "telemetry_adapter",
          targetId: updated.id,
          metadata: parsed,
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update telemetry adapter" });
      }
    },
  );

  app.post(
    "/api/organization/telemetry-adapter/rotate-key",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const rotated = await telemetryAdapterService.rotateKeyForOrg(req.tenant!.organizationId);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.telemetry_adapter.key_rotated",
        targetType: "telemetry_adapter",
        targetId: rotated.adapter.id,
        metadata: {
          keyPrefix: rotated.adapter.keyPrefix,
        },
      });
      return res.json(rotated);
    },
  );

  // Reviewer exception routes
  app.get(
    "/api/telemetry/reviewer-exceptions",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      const systemId = typeof req.query.systemId === "string" && req.query.systemId.trim() ? req.query.systemId.trim() : null;
      const rows = await telemetryReviewerExceptionService.listForOrg(req.tenant!.organizationId, {
        systemId,
      });
      return res.json(rows);
    },
  );

  app.post(
    "/api/telemetry/reviewer-exceptions",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryReviewerExceptionSchema.parse(req.body);
        if (parsed.systemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, parsed.systemId);
          if (!system) {
            return res.status(404).json({ message: "AI system not found for this organization" });
          }
        }
        const created = await telemetryReviewerExceptionService.createForOrg(req.tenant!.organizationId, {
          systemId: parsed.systemId ?? null,
          gateway: parsed.gateway ?? null,
          promptPattern: parsed.promptPattern,
          suppressedThresholds: parsed.suppressedThresholds ?? ["restricted_prompt_detected"],
          reviewerNote: parsed.reviewerNote,
          active: parsed.active ?? true,
          expiresAt: parsed.expiresAt ?? null,
          createdBy: req.user!.fullName || req.user!.username,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_exception",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Reviewer exception created for prompt pattern "${created.promptPattern}"`,
          },
        });
        return res.status(201).json(created);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to create reviewer exception" });
      }
    },
  );

  app.patch(
    "/api/telemetry/reviewer-exceptions/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryReviewerExceptionPatchSchema.parse(req.body);
        const updated = await telemetryReviewerExceptionService.updateForOrg(
          req.tenant!.organizationId,
          routeParam(req.params.id),
          {
            gateway: parsed.gateway ?? undefined,
            promptPattern: parsed.promptPattern ?? undefined,
            suppressedThresholds: parsed.suppressedThresholds ?? undefined,
            reviewerNote: parsed.reviewerNote ?? undefined,
            active: parsed.active ?? undefined,
            expiresAt: parsed.expiresAt ?? undefined,
          },
        );
        if (!updated) {
          return res.status(404).json({ message: "Reviewer exception not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_exception",
            entityId: updated.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Reviewer exception updated for prompt pattern "${updated.promptPattern}"`,
          },
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update reviewer exception" });
      }
    },
  );

  // Telemetry policy advisor routes
  app.get(
    "/api/telemetry-policy/recommendations",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const systemId = typeof req.query.systemId === "string" && req.query.systemId.trim() ? req.query.systemId.trim() : null;
        if (systemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
          if (!system) {
            return res.status(404).json({ message: "AI system not found" });
          }
        }
        const recommendations = await telemetryPolicyAdvisorService.getRecommendations({
          organizationId: req.tenant!.organizationId,
          systemId,
        });
        return res.json(recommendations);
      } catch (err: any) {
        return res.status(500).json({ message: err.message || "Failed to load telemetry policy recommendations" });
      }
    },
  );

  app.post(
    "/api/telemetry-policy/assist",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = telemetryPolicyAssistSchema.parse(req.body);
        if (parsed.systemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, parsed.systemId);
          if (!system) {
            return res.status(404).json({ message: "AI system not found" });
          }
        }

        const suggestion = await telemetryPolicyAdvisorService.assist({
          organizationId: req.tenant!.organizationId,
          systemId: parsed.systemId ?? null,
          intent: parsed.intent,
        });

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "telemetry_policy.assist_used",
          targetType: "telemetry_policy",
          targetId: parsed.systemId ?? req.tenant!.organizationId,
          metadata: {
            systemId: parsed.systemId ?? null,
            intentPreview: parsed.intent.slice(0, 240),
            matchedIntents: suggestion.matchedIntents,
            recommendedPresetId: suggestion.recommendedPresetId,
          },
        });

        return res.json(suggestion);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to assist telemetry policy" });
      }
    },
  );

  app.post(
    "/api/telemetry-policy/impact",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = telemetryPolicyImpactSchema.parse(req.body ?? {});
        if (parsed.systemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, parsed.systemId);
          if (!system) {
            return res.status(404).json({ message: "AI system not found" });
          }
        }

        const impact = await telemetryPolicyAdvisorService.getImpactAnalysis({
          organizationId: req.tenant!.organizationId,
          systemId: parsed.systemId ?? null,
          patch: parsed.patch,
        });

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "telemetry_policy.impact_simulated",
          targetType: "telemetry_policy",
          targetId: parsed.systemId ?? req.tenant!.organizationId,
          metadata: {
            systemId: parsed.systemId ?? null,
            sampleSize: impact.sampleSize,
            delta: impact.delta,
          },
        });

        return res.json(impact);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to simulate telemetry policy impact" });
      }
    },
  );
}
