import { randomBytes } from "crypto";
import * as dns from "node:dns/promises";
import type { Organization, OrganizationDomain } from "@shared/schema";
import { storage } from "../storage";

const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VERIFICATION_PREFIX = "_aicontrolgrid";
let txtResolver: (hostname: string) => Promise<string[][]> = dns.resolveTxt;

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function validateDomainInput(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    throw new Error("Domain cannot be empty");
  }
  if (
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    normalized.includes("*") ||
    normalized.includes(" ")
  ) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  return normalized;
}

function normalizeInputDomains(domains: string[]): string[] {
  return Array.from(new Set(domains.map(validateDomainInput)));
}

function extractEmailDomain(email: string): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  const parts = normalizedEmail.split("@");
  if (parts.length !== 2) {
    return null;
  }
  const domain = normalizeDomain(parts[1]);
  return domain || null;
}

function getLegacyAllowedDomains(settings: unknown): string[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return [];
  }
  const auth = (settings as Record<string, unknown>).auth;
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    return [];
  }
  const allowedDomains = (auth as Record<string, unknown>).allowedDomains;
  if (!Array.isArray(allowedDomains)) {
    return [];
  }
  return Array.from(
    new Set(
      allowedDomains
        .filter((domain): domain is string => typeof domain === "string")
        .map(normalizeDomain)
        .filter(Boolean),
    ),
  );
}

async function getStoredOrganizationDomains(organizationId: string): Promise<OrganizationDomain[]> {
  return storage.getOrganizationDomainsByOrg(organizationId);
}

async function getAllowedDomainsForOrganization(organization: Organization): Promise<string[]> {
  const storedDomains = await getStoredOrganizationDomains(organization.id);
  if (storedDomains.length > 0) {
    return Array.from(
      new Set(
        storedDomains
          .map((entry) => normalizeDomain(entry.domain))
          .filter(Boolean),
      ),
    );
  }

  return getLegacyAllowedDomains(organization.settings);
}

async function getVerifiedDomainsForJit(organizationId: string): Promise<string[]> {
  const storedDomains = await getStoredOrganizationDomains(organizationId);
  return Array.from(
    new Set(
      storedDomains
        .filter((entry) => entry.isVerified && entry.verifiedAt instanceof Date)
        .map((entry) => normalizeDomain(entry.domain))
        .filter(Boolean),
    ),
  );
}

async function isEmailAllowedForJitProvisioning(
  organization: Organization,
  email: string | null | undefined,
): Promise<boolean> {
  // JIT is an account-creation boundary. Legacy settings and unverified
  // domain rows may be displayed/configured, but they cannot authorize JIT.
  const allowedDomains = await getVerifiedDomainsForJit(organization.id);
  if (allowedDomains.length === 0) return false;
  if (!email) {
    return false;
  }
  const domain = extractEmailDomain(email);
  if (!domain) {
    return false;
  }
  return allowedDomains.includes(domain);
}

async function replaceAllowedDomains(
  organizationId: string,
  domains: Array<
    string | {
      id?: string;
      domain: string;
      isVerified?: boolean;
      isPrimary?: boolean;
      verificationToken?: string;
      verifiedAt?: Date | null;
      createdAt?: Date;
    }
  >,
): Promise<OrganizationDomain[]> {
  const normalizedDomains = Array.from(
    new Map(
      domains.map((entry, index) => {
        const value = typeof entry === "string" ? { domain: entry, isPrimary: index === 0 } : entry;
        const normalized = validateDomainInput(value.domain);
        return [
          normalized,
          {
            ...value,
            domain: normalized,
            verificationToken: value.verificationToken ?? randomBytes(16).toString("hex"),
            isVerified: value.isVerified ?? false,
            verifiedAt: value.isVerified ? value.verifiedAt ?? new Date() : null,
          },
        ] as const;
      }),
    ).values(),
  );
  return storage.replaceOrganizationDomainsForOrg(
    organizationId,
    normalizedDomains.map((entry, index) => ({
      id: entry.id,
      domain: entry.domain,
      isVerified: entry.isVerified,
      isPrimary: entry.isPrimary ?? index === 0,
      verificationToken: entry.verificationToken,
      verifiedAt: entry.isVerified ? entry.verifiedAt ?? new Date() : null,
      createdAt: entry.createdAt,
    })),
  );
}

async function findOrganizationByEmail(email: string): Promise<Organization | undefined> {
  const domain = extractEmailDomain(email);
  if (!domain) {
    return undefined;
  }
  return storage.findOrganizationByEmailDomain(domain);
}

function getVerificationRecordName(domain: string): string {
  return `${VERIFICATION_PREFIX}.${normalizeDomain(domain)}`;
}

function getVerificationRecordValue(token: string): string {
  return `aicontrolgrid-verification=${token}`;
}

async function verifyDomainOwnership(entry: Pick<OrganizationDomain, "domain" | "verificationToken">): Promise<boolean> {
  const recordName = getVerificationRecordName(entry.domain);
  const expectedValue = getVerificationRecordValue(entry.verificationToken);
  const records = await txtResolver(recordName);
  const flattened = records.flat().map((value) => value.trim());
  return flattened.includes(expectedValue);
}

function setTxtResolverForTests(resolver: typeof txtResolver) {
  txtResolver = resolver;
}

function resetTxtResolverForTests() {
  txtResolver = dns.resolveTxt;
}

export const domainService = {
  normalizeDomain,
  validateDomainInput,
  normalizeInputDomains,
  extractEmailDomain,
  getAllowedDomainsForOrganization,
  getVerifiedDomainsForJit,
  getStoredOrganizationDomains,
  isEmailAllowedForJitProvisioning,
  replaceAllowedDomains,
  findOrganizationByEmail,
  getVerificationRecordName,
  getVerificationRecordValue,
  verifyDomainOwnership,
  setTxtResolverForTests,
  resetTxtResolverForTests,
};
