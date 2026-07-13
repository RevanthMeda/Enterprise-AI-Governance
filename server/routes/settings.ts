import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant, requireOrgRole } from "../tenant";
import { storage } from "../storage";
import { subscriptionTiers, subscriptionStatuses, userRoles } from "@shared/schema";
import { jiraService } from "../services/jiraService";
import { integrationConnectorService } from "../services/integrationConnectorService";
import { domainService } from "../services/domainService";
import { threatIntelligenceService } from "../services/threatIntelligenceService";
import { regionalGovernanceProfileService } from "../services/regionalGovernanceProfileService";
import { subscriptionService } from "../services/subscriptionService";
import { auditService } from "../services/auditService";
import { governanceEventService } from "../services/governanceEventService";
import {
  integrationConnectorSeverityFloors,
  integrationConnectorTypes,
  sanitizeIntegrationConnectors,
} from "@shared/integration-connectors";
import {
  sanitizeThreatIntelConfig,
  threatIntelExternalFeedTypes,
  threatIntelIndicatorSeverities,
} from "@shared/threat-intelligence";
import {
  regionalComplianceFrameworkIds,
  regionalDataResidencyModes,
  regionalPrimaryRegions,
  sanitizeRegionalGovernanceProfile,
} from "@shared/regional-governance-profile";
import { z } from "zod";
import {
  routeParam,
  recordAdminAuditEvent,
  getOptionalString,
  getOrgAuthSettings,
  applyOrgAuthSettings,
  OrgAuthSettings,
} from "./_helpers";
import { isProductionEnvironment, isSelfSignupEnabled } from "../env";
import {
  SafeOutboundHttpError,
  validateOutboundUrlPolicy,
} from "../safe-outbound-http";
import {
  getOidcClientSecretState,
  mergeOidcClientSecret,
  tryMigrateOidcClientSecret,
} from "../services/organizationSecretService";
import { updateOrganizationSettingsForTenant } from "../services/organizationSettingsService";
import { areInsecureSamlTestFixturesAllowed } from "../services/ssoService";
import {
  assertOidcClientSecretBindingUpdate,
  validateOidcEndpointConfiguration,
} from "../services/oidcEndpointSecurity";

const authModeValues = ["local", "saml", "oidc"] as const;
const ssoDefaultRoleOptions = userRoles;

const orgAuthSettingsPatchSchema = z.object({
  mode: z.enum(authModeValues).optional(),
  ssoUrl: z.string().trim().url().max(1000).nullable().optional(),
  entityId: z.string().trim().max(500).nullable().optional(),
  idpIssuer: z.string().trim().max(500).nullable().optional(),
  certificate: z.string().trim().max(12000).nullable().optional(),
  callbackUrl: z.string().trim().max(1000).nullable().optional(),
  oidcIssuer: z.string().trim().url().max(1000).nullable().optional(),
  oidcAuthorizationUrl: z.string().trim().url().max(1000).nullable().optional(),
  oidcTokenUrl: z.string().trim().url().max(1000).nullable().optional(),
  oidcJwksUrl: z.string().trim().url().max(1000).nullable().optional(),
  oidcClientId: z.string().trim().max(500).nullable().optional(),
  oidcClientSecret: z.string().trim().max(4000).nullable().optional(),
  clearOidcClientSecret: z.boolean().optional(),
  oidcScopes: z.string().trim().max(500).nullable().optional(),
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  jitProvisioning: z.boolean().optional(),
  enforceSso: z.boolean().optional(),
  strictSamlValidation: z.boolean().optional(),
  defaultRole: z.enum(ssoDefaultRoleOptions).optional(),
});

type OrgAuthSettingsPatch = z.infer<typeof orgAuthSettingsPatchSchema>;

function buildOrgAuthSettingsUpdate(input: {
  organizationId: string;
  current: OrgAuthSettings;
  parsed: OrgAuthSettingsPatch;
  allowedDomains: string[];
  mergeSecret: boolean;
}): OrgAuthSettings {
  const { current, parsed } = input;
  const updated: OrgAuthSettings = {
    ...current,
    mode: parsed.mode ?? current.mode,
    ssoUrl: parsed.ssoUrl === undefined ? current.ssoUrl : parsed.ssoUrl,
    entityId: parsed.entityId === undefined ? current.entityId : parsed.entityId,
    idpIssuer: parsed.idpIssuer === undefined ? current.idpIssuer : parsed.idpIssuer,
    certificate: parsed.certificate === undefined ? current.certificate : parsed.certificate,
    callbackUrl: parsed.callbackUrl === undefined ? current.callbackUrl : parsed.callbackUrl,
    oidcIssuer: parsed.oidcIssuer === undefined ? current.oidcIssuer : parsed.oidcIssuer,
    oidcAuthorizationUrl:
      parsed.oidcAuthorizationUrl === undefined
        ? current.oidcAuthorizationUrl
        : parsed.oidcAuthorizationUrl,
    oidcTokenUrl: parsed.oidcTokenUrl === undefined ? current.oidcTokenUrl : parsed.oidcTokenUrl,
    oidcJwksUrl: parsed.oidcJwksUrl === undefined ? current.oidcJwksUrl : parsed.oidcJwksUrl,
    oidcClientId: parsed.oidcClientId === undefined ? current.oidcClientId : parsed.oidcClientId,
    oidcClientSecret: current.oidcClientSecret,
    oidcScopes:
      parsed.oidcScopes === undefined
        ? current.oidcScopes
        : parsed.oidcScopes ?? "openid profile email",
    allowedDomains: input.allowedDomains,
    jitProvisioning: parsed.jitProvisioning ?? current.jitProvisioning,
    enforceSso: parsed.enforceSso ?? current.enforceSso,
    strictSamlValidation: parsed.strictSamlValidation ?? current.strictSamlValidation,
    defaultRole: parsed.defaultRole ?? current.defaultRole,
  };

  if (updated.mode === "local") {
    updated.enforceSso = false;
    updated.strictSamlValidation = false;
  }
  if (updated.mode !== "saml") {
    updated.strictSamlValidation = false;
  }
  if (input.mergeSecret) {
    assertOidcClientSecretBindingUpdate({
      currentSettings: current,
      nextSettings: updated,
      currentSecret: current.oidcClientSecret,
      nextSecret: parsed.oidcClientSecret,
      clearSecret: parsed.clearOidcClientSecret,
    });
    updated.oidcClientSecret = mergeOidcClientSecret({
      organizationId: input.organizationId,
      currentValue: current.oidcClientSecret,
      nextValue: parsed.oidcClientSecret,
      clear: parsed.clearOidcClientSecret === true,
      bindingSettings: updated,
    });
  }
  return updated;
}

function assertOrgAuthSettingsValid(settings: OrgAuthSettings): void {
  if (settings.mode === "saml") {
    if (!settings.ssoUrl) {
      throw new Error("SSO URL is required when mode is saml");
    }
    if (!settings.strictSamlValidation && !areInsecureSamlTestFixturesAllowed()) {
      throw new Error("Strict SAML validation is required");
    }
    if (settings.strictSamlValidation && !settings.certificate) {
      throw new Error("IdP certificate is required when strict SAML validation is enabled");
    }
    if (settings.strictSamlValidation && !settings.idpIssuer) {
      throw new Error("Expected IdP issuer is required when strict SAML validation is enabled");
    }
  }
  if (
    settings.mode === "oidc" &&
    (!settings.oidcIssuer ||
      !settings.oidcAuthorizationUrl ||
      !settings.oidcTokenUrl ||
      !settings.oidcJwksUrl ||
      !settings.oidcClientId)
  ) {
    throw new Error(
      "OIDC issuer, authorization URL, token URL, JWKS URL, and client ID are required when mode is oidc",
    );
  }
  if (settings.mode === "oidc") {
    validateOidcEndpointConfiguration(settings);
  }
}

const updateOrganizationDomainsSchema = z.object({
  domains: z.array(z.string().trim().min(1).max(255)).max(50),
});

const jiraIntegrationSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().trim().url().max(1000).nullable().optional(),
  projectKey: z.string().trim().max(120).nullable().optional(),
  userEmail: z.string().trim().email().max(255).nullable().optional(),
  apiToken: z.string().trim().max(4000).nullable().optional(),
  clearApiToken: z.boolean().optional(),
  issueType: z.string().trim().max(120).default("Task"),
  labels: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

const integrationConnectorSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  type: z.enum(integrationConnectorTypes),
  enabled: z.boolean(),
  webhookUrl: z.string().trim().url().max(1000).nullable().optional(),
  authToken: z.string().trim().max(400).nullable().optional(),
  clearAuthToken: z.boolean().optional(),
  eventFilters: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  severityFloor: z.enum(integrationConnectorSeverityFloors),
});

const threatIntelConfigSchema = z.object({
  enabled: z.boolean(),
  advisoryMode: z.boolean(),
  externalFeed: z.object({
    enabled: z.boolean(),
    providerType: z.enum(threatIntelExternalFeedTypes).optional(),
    providerLabel: z.string().trim().max(120).nullable().optional(),
    feedUrl: z.string().trim().url().max(1000).nullable().optional(),
    authToken: z.string().trim().max(400).nullable().optional(),
    clearAuthToken: z.boolean().optional(),
  }).optional(),
  customIndicators: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(120),
        pattern: z.string().trim().min(1).max(200),
        category: z.string().trim().min(1).max(80),
        severity: z.enum(threatIntelIndicatorSeverities),
        enabled: z.boolean(),
      }),
    )
    .max(20),
});

const regionalGovernanceProfileSchema = z.object({
  primaryRegion: z.enum(regionalPrimaryRegions),
  secondaryRegions: z.array(z.enum(regionalPrimaryRegions)).max(regionalPrimaryRegions.length - 1),
  dataResidencyMode: z.enum(regionalDataResidencyModes),
  activeFrameworks: z.array(z.enum(regionalComplianceFrameworkIds)).min(1).max(regionalComplianceFrameworkIds.length),
});

const subscriptionPatchSchema = z
  .object({
    tier: z.enum(subscriptionTiers).optional(),
    status: z.enum(subscriptionStatuses).optional(),
    billingEmail: z.string().trim().email().max(255).nullable().optional(),
    seatLimit: z.number().int().min(1).max(5000).optional(),
    trialEndsAt: z.coerce.date().optional().nullable(),
    renewalAt: z.coerce.date().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

export function registerSettingsRoutes(app: Express): void {
  app.get("/api/settings", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const user = await storage.getUser(req.user!.id);
    return res.json({
      allowSelfSignup: isSelfSignupEnabled(),
      mfaEnabled: Boolean(user?.mfaEnabled),
      currentOrganizationId: req.session.currentOrganizationId ?? null,
    });
  });

  app.patch("/api/settings", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    return res.json({
      ok: true,
      message: "Settings update accepted",
      updates: req.body ?? {},
    });
  });

  app.get(
    "/api/organization/auth-settings",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const organization = await storage.getOrganizationById(req.tenant!.organizationId);

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const authSettings = getOrgAuthSettings(organization.settings);
      const allowedDomains = await domainService.getAllowedDomainsForOrganization(organization);
      await tryMigrateOidcClientSecret({
        organizationId: organization.id,
        rawSettings: organization.settings,
      });

      return res.json({
        ...authSettings,
        ...getOidcClientSecretState(organization.settings),
        allowedDomains,
      });
    },
  );

  app.patch(
    "/api/organization/auth-settings",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const parsed = orgAuthSettingsPatchSchema.parse(req.body ?? {});
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);

        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const current = {
          ...getOrgAuthSettings(organization.settings),
          allowedDomains: await domainService.getAllowedDomainsForOrganization(organization),
        };
        const requestedAllowedDomains =
          parsed.allowedDomains === undefined
            ? current.allowedDomains
            : domainService.normalizeInputDomains(parsed.allowedDomains);
        const preview = buildOrgAuthSettingsUpdate({
          organizationId: organization.id,
          current,
          parsed,
          allowedDomains: requestedAllowedDomains,
          mergeSecret: false,
        });
        assertOrgAuthSettingsValid(preview);

        let allowedDomains = preview.allowedDomains;
        if (parsed.allowedDomains !== undefined) {
          const storedDomains = await domainService.replaceAllowedDomains(
            organization.id,
            preview.allowedDomains,
          );
          allowedDomains = storedDomains.map((entry) => entry.domain);
        }

        const persisted = await updateOrganizationSettingsForTenant(
          organization.id,
          (currentSettings) => {
            const updated = buildOrgAuthSettingsUpdate({
              organizationId: organization.id,
              current: getOrgAuthSettings(currentSettings),
              parsed,
              allowedDomains,
              mergeSecret: true,
            });
            assertOrgAuthSettingsValid(updated);
            return applyOrgAuthSettings(currentSettings, updated);
          },
        );
        if (!persisted) {
          return res.status(404).json({ message: "Organization not found" });
        }
        const updated = getOrgAuthSettings(persisted.settings);

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.auth_settings.updated",
          targetType: "organization",
          targetId: organization.id,
          metadata: {
            mode: updated.mode,
            enforceSso: updated.enforceSso,
            strictSamlValidation: updated.strictSamlValidation,
            allowedDomainsCount: updated.allowedDomains.length,
            jitProvisioning: updated.jitProvisioning,
            defaultRole: updated.defaultRole,
          },
        });

        return res.json({
          ...updated,
          ...getOidcClientSecretState(persisted.settings),
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update auth settings" });
      }
    },
  );

  app.get(
    "/api/organization/domains",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const buildDomainResponse = (
        storedDomains: Array<{ id: string; domain: string; isVerified: boolean; isPrimary: boolean }>,
        fallbackDomains: string[] = [],
      ) => ({
        domains: storedDomains.length > 0 ? storedDomains.map((entry) => entry.domain) : fallbackDomains,
        entries:
          storedDomains.length > 0
            ? storedDomains.map((entry) => ({
                id: entry.id,
                domain: entry.domain,
                isVerified: entry.isVerified,
                isPrimary: entry.isPrimary,
                verificationRecordName: domainService.getVerificationRecordName(entry.domain),
                verificationRecordValue: domainService.getVerificationRecordValue((entry as any).verificationToken),
                verifiedAt: (entry as any).verifiedAt ?? null,
              }))
            : fallbackDomains.map((domain, index) => ({
                id: null,
                domain,
                isVerified: false,
                isPrimary: index === 0,
                verificationRecordName: null,
                verificationRecordValue: null,
                verifiedAt: null,
              })),
        source: storedDomains.length > 0 ? "table" : fallbackDomains.length > 0 ? "legacy" : "none",
      });

      const organization = await storage.getOrganizationById(req.tenant!.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
      const domains =
        storedDomains.length > 0
          ? storedDomains.map((entry) => entry.domain)
          : await domainService.getAllowedDomainsForOrganization(organization);

      return res.json(buildDomainResponse(storedDomains, domains));
    },
  );

  app.put(
    "/api/organization/domains",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const parsed = updateOrganizationDomainsSchema.parse(req.body ?? {});
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);

        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domains = domainService.normalizeInputDomains(parsed.domains);
        const existingDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const storedDomains = await domainService.replaceAllowedDomains(
          organization.id,
          domains.map((domain, index) => {
            const existing = existingDomains.find((entry) => entry.domain === domain);
            return {
              id: existing?.id,
              domain,
              isVerified: existing?.isVerified ?? false,
              isPrimary: existing?.isPrimary ?? index === 0,
              verificationToken: existing?.verificationToken,
              verifiedAt: existing?.verifiedAt ?? null,
              createdAt: existing?.createdAt,
            };
          }),
        );
        const persisted = await updateOrganizationSettingsForTenant(
          organization.id,
          (currentSettings) =>
            applyOrgAuthSettings(currentSettings, {
              ...getOrgAuthSettings(currentSettings),
              allowedDomains: storedDomains.map((entry) => entry.domain),
            }),
        );
        if (!persisted) {
          return res.status(404).json({ message: "Organization not found" });
        }

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domains.updated",
          targetType: "organization",
          targetId: organization.id,
          metadata: {
            domains: storedDomains.map((entry) => entry.domain),
            domainsCount: storedDomains.length,
          },
        });

        return res.json({
          domains: storedDomains.map((entry) => entry.domain),
          entries: storedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationRecordName: domainService.getVerificationRecordName(entry.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(entry.verificationToken),
            verifiedAt: entry.verifiedAt ?? null,
          })),
          source: "table",
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update organization domains" });
      }
    },
  );

  app.patch(
    "/api/organization/domains/:domainId",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const parsed = z.object({
          isPrimary: z.literal(true),
        }).parse(req.body ?? {});

        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domainId = routeParam(req.params.domainId);
        const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const targetDomain = storedDomains.find((entry) => entry.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ message: "Organization domain not found" });
        }

        const nextDomains = storedDomains.map((entry) => ({
          id: entry.id,
          domain: entry.domain,
          isVerified: entry.isVerified,
          isPrimary: entry.id === domainId,
          verificationToken: entry.verificationToken,
          verifiedAt: entry.verifiedAt ?? null,
          createdAt: entry.createdAt,
        }));

        const updatedDomains = await domainService.replaceAllowedDomains(organization.id, nextDomains);
        const persisted = await updateOrganizationSettingsForTenant(
          organization.id,
          (currentSettings) =>
            applyOrgAuthSettings(currentSettings, {
              ...getOrgAuthSettings(currentSettings),
              allowedDomains: updatedDomains.map((entry) => entry.domain),
            }),
        );
        if (!persisted) {
          return res.status(404).json({ message: "Organization not found" });
        }

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domain.primary_updated",
          targetType: "organization_domain",
          targetId: targetDomain.id,
          metadata: {
            domain: targetDomain.domain,
            isVerified: targetDomain.isVerified,
            isPrimary: true,
          },
        });

        return res.json({
          domains: updatedDomains.map((entry) => entry.domain),
          entries: updatedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationRecordName: domainService.getVerificationRecordName(entry.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(entry.verificationToken),
            verifiedAt: entry.verifiedAt ?? null,
          })),
          source: "table",
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update organization domain" });
      }
    },
  );

  app.post(
    "/api/organization/domains/:domainId/verify",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domainId = routeParam(req.params.domainId);
        const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const targetDomain = storedDomains.find((entry) => entry.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ message: "Organization domain not found" });
        }

        const isVerified = await domainService.verifyDomainOwnership(targetDomain);
        if (!isVerified) {
          return res.status(409).json({
            message: "Verification TXT record not found",
            verificationRecordName: domainService.getVerificationRecordName(targetDomain.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(targetDomain.verificationToken),
          });
        }

        const updatedDomains = await domainService.replaceAllowedDomains(
          organization.id,
          storedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.id === domainId ? true : entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationToken: entry.verificationToken,
            verifiedAt: entry.id === domainId ? new Date() : entry.verifiedAt ?? null,
            createdAt: entry.createdAt,
          })),
        );

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domain.verified",
          targetType: "organization_domain",
          targetId: targetDomain.id,
          metadata: {
            domain: targetDomain.domain,
            verificationRecordName: domainService.getVerificationRecordName(targetDomain.domain),
          },
        });

        return res.json({
          domains: updatedDomains.map((entry) => entry.domain),
          entries: updatedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationRecordName: domainService.getVerificationRecordName(entry.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(entry.verificationToken),
            verifiedAt: entry.verifiedAt ?? null,
          })),
          source: "table",
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to verify organization domain" });
      }
    },
  );

  app.delete(
    "/api/organization/domains/:domainId",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domainId = routeParam(req.params.domainId);
        const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const targetDomain = storedDomains.find((entry) => entry.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ message: "Organization domain not found" });
        }

        await storage.deleteOrganizationDomainByIdForOrg(organization.id, domainId);

        const remainingDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const rebalancedDomains =
          remainingDomains.length > 0
            ? await domainService.replaceAllowedDomains(
                organization.id,
                remainingDomains.map((entry, index) => ({
                  id: entry.id,
                  domain: entry.domain,
                  isVerified: entry.isVerified,
                  isPrimary: entry.isPrimary || index === 0,
                  verificationToken: entry.verificationToken,
                  verifiedAt: entry.verifiedAt ?? null,
                  createdAt: entry.createdAt,
                })),
              )
            : [];

        const persisted = await updateOrganizationSettingsForTenant(
          organization.id,
          (currentSettings) =>
            applyOrgAuthSettings(currentSettings, {
              ...getOrgAuthSettings(currentSettings),
              allowedDomains: rebalancedDomains.map((entry) => entry.domain),
            }),
        );
        if (!persisted) {
          return res.status(404).json({ message: "Organization not found" });
        }

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domain.deleted",
          targetType: "organization_domain",
          targetId: targetDomain.id,
          metadata: {
            domain: targetDomain.domain,
            remainingDomains: rebalancedDomains.map((entry) => entry.domain),
          },
        });

        return res.status(204).send();
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to delete organization domain" });
      }
    },
  );

  app.get("/api/organization/jira-integration", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const integration = await jiraService.getIntegration(req.tenant!.organizationId);
    return res.json(integration);
  });

  app.put("/api/organization/jira-integration", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = jiraIntegrationSchema.parse(req.body);
      if (parsed.baseUrl) {
        validateOutboundUrlPolicy(parsed.baseUrl, isProductionEnvironment());
      }
      const integration = await jiraService.upsertIntegration(req.tenant!.organizationId, {
        enabled: parsed.enabled,
        baseUrl: parsed.baseUrl ?? null,
        projectKey: parsed.projectKey ?? null,
        userEmail: parsed.userEmail ?? null,
        apiToken: parsed.apiToken,
        clearApiToken: parsed.clearApiToken === true,
        issueType: parsed.issueType,
        labels: parsed.labels ?? [],
      });
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.jira_integration.updated",
        targetType: "jira_integration",
        targetId: integration.id,
        metadata: {
          enabled: integration.enabled,
          projectKey: integration.projectKey,
        },
      });
      return res.json(integration);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update Jira integration" });
    }
  });

  app.post("/api/organization/jira-integration/test", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const result = await jiraService.testConnection(req.tenant!.organizationId);
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.get(
    "/api/integrations/connectors",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const connectors = await integrationConnectorService.getForOrg(req.tenant!.organizationId);
      res.json(connectors);
    },
  );

  app.put(
    "/api/integrations/connectors",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = z.array(integrationConnectorSchema).max(12).parse(req.body ?? []);
        for (const connector of parsed) {
          if (connector.webhookUrl) {
            validateOutboundUrlPolicy(connector.webhookUrl, isProductionEnvironment());
          }
        }
        const clearById = new Map(parsed.map((connector) => [connector.id, connector.clearAuthToken === true]));
        const updated = await integrationConnectorService.updateForOrg(
          req.tenant!.organizationId,
          sanitizeIntegrationConnectors(parsed).map((connector) => ({
            ...connector,
            clearAuthToken: clearById.get(connector.id) === true,
          })),
        );
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "integration_connector",
            entityId: req.tenant!.organizationId,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Updated ${updated.length} integration connector(s).`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to update integration connectors" });
      }
    },
  );

  app.post(
    "/api/integrations/connectors/test",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const connectorId =
        req.body && typeof req.body === "object" && typeof (req.body as Record<string, unknown>).connectorId === "string"
          ? ((req.body as Record<string, unknown>).connectorId as string).trim()
          : null;
      const result = await governanceEventService.emitForOrg({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        eventType: "connector.test",
        title: "Connector test event",
        summary: "This is a governed test payload generated from the Integrations workspace.",
        severity: "warning",
        entityType: "integration_connector",
        entityId: connectorId,
        targetConnectorId: connectorId,
        metadata: {
          connectorId,
          source: "integration_test",
        },
      });
      res.json(result);
    },
  );

  app.get(
    "/api/threat-intelligence/config",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const config = await threatIntelligenceService.getConfigForOrg(req.tenant!.organizationId);
        res.json(config);
      } catch (error) {
        console.error("Failed to load threat intelligence config:", error);
        res.status(500).json({ message: "Failed to load threat intelligence config" });
      }
    },
  );

  app.put(
    "/api/threat-intelligence/config",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const parsedResult = threatIntelConfigSchema.safeParse(req.body ?? {});
      if (!parsedResult.success) {
        return res.status(400).json({ message: "Invalid threat intelligence configuration" });
      }
      const parsed = parsedResult.data;

      if (parsed.externalFeed?.feedUrl) {
        try {
          validateOutboundUrlPolicy(parsed.externalFeed.feedUrl, isProductionEnvironment());
        } catch (error) {
          const message =
            error instanceof SafeOutboundHttpError
              ? error.message
              : "External feed URL is not allowed";
          return res.status(400).json({ message });
        }
      }

      try {
        const updated = await threatIntelligenceService.updateConfigForOrg(req.tenant!.organizationId, {
          enabled: parsed.enabled,
          advisoryMode: parsed.advisoryMode,
          externalFeed: {
            enabled: parsed.externalFeed?.enabled === true,
            providerType: parsed.externalFeed?.providerType ?? "generic_json",
            providerLabel: parsed.externalFeed?.providerLabel ?? null,
            feedUrl: parsed.externalFeed?.feedUrl ?? null,
            authToken: parsed.externalFeed?.authToken ?? null,
            clearAuthToken: parsed.externalFeed?.clearAuthToken === true,
          },
          customIndicators: parsed.customIndicators.map((indicator) => ({
            ...indicator,
            source: "custom" as const,
          })),
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "threat_intelligence",
            entityId: req.tenant!.organizationId,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Threat intelligence updated with ${updated.customIndicators.length} custom indicator(s).`,
          },
        });
        res.json(updated);
      } catch (error) {
        console.error("Failed to update threat intelligence config:", error);
        res.status(500).json({ message: "Failed to update threat intelligence config" });
      }
    },
  );

  app.get(
    "/api/threat-intelligence/summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const summary = await threatIntelligenceService.getSummaryForOrg(req.tenant!.organizationId);
        res.json(summary);
      } catch (error) {
        console.error("Failed to load threat intelligence summary:", error);
        res.status(500).json({ message: "Failed to load threat intelligence summary" });
      }
    },
  );

  app.get(
    "/api/organization/regional-governance-profile",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const profile = await regionalGovernanceProfileService.getForOrg(req.tenant!.organizationId);
      res.json(profile);
    },
  );

  app.put(
    "/api/organization/regional-governance-profile",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = regionalGovernanceProfileSchema.parse(req.body ?? {});
        const updated = await regionalGovernanceProfileService.updateForOrg(
          req.tenant!.organizationId,
          sanitizeRegionalGovernanceProfile(parsed),
        );
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "regional_governance_profile",
            entityId: req.tenant!.organizationId,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Regional governance profile updated for ${updated.primaryRegion}.`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to update regional governance profile" });
      }
    },
  );

  app.get("/api/organization/subscription", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const subscription = await subscriptionService.getForOrg(req.tenant!.organizationId);
    return res.json(subscription);
  });

  app.patch("/api/organization/subscription", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = subscriptionPatchSchema.parse(req.body);
      const updated = await subscriptionService.updateForOrg(req.tenant!.organizationId, parsed);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.subscription.updated",
        targetType: "subscription",
        targetId: updated.id,
        metadata: {
          tier: updated.tier,
          status: updated.status,
          seatLimit: updated.seatLimit,
        },
      });
      return res.json(updated);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update subscription" });
    }
  });
}
