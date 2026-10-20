import type { PoolConfig } from "pg";

type PgSslConfig = NonNullable<PoolConfig["ssl"]>;

function parseConnectionUrl(connectionString: string): { url: URL; emptyHost: boolean } {
  try {
    return { url: new URL(connectionString), emptyHost: false };
  } catch {
    // pg also accepts user:password@/database with a host query parameter.
    // Parse that form without leaving its SSL parameters for pg to override us.
    try {
      return {
        url: new URL(connectionString.replace("@/", "@pg-empty-host.invalid/")),
        emptyHost: true,
      };
    } catch {
      // URL errors can contain credentials. Never include the input or cause.
      throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
    }
  }
}

function stripSslQueryParams(connectionString: string): string {
  const { url, emptyHost } = parseConnectionUrl(connectionString);
  [
    "sslmode",
    "ssl",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "sslaccept",
  ].forEach((key) => url.searchParams.delete(key));
  const sanitized = url.toString();
  return emptyHost ? sanitized.replace("@pg-empty-host.invalid/", "@/") : sanitized;
}

function getConfiguredSslMode(connectionString: string): string | null {
  const explicitMode = process.env.DB_SSL_MODE ?? process.env.PGSSLMODE;
  if (explicitMode) return explicitMode.trim().toLowerCase();

  const { url } = parseConnectionUrl(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  return sslMode ? sslMode.trim().toLowerCase() : null;
}

function getConfiguredRejectUnauthorized(): boolean {
  const explicit = process.env.DB_SSL_REJECT_UNAUTHORIZED ?? process.env.PGSSL_REJECT_UNAUTHORIZED;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.NODE_ENV === "production";
}

function buildSslConfig(connectionString: string): PgSslConfig | undefined {
  const sslMode = getConfiguredSslMode(connectionString);

  if (!sslMode) {
    return process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined;
  }

  if (sslMode === "disable" || sslMode === "allow") {
    return false;
  }

  if (sslMode === "verify-ca" || sslMode === "verify-full") {
    return { rejectUnauthorized: true };
  }

  if (sslMode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: getConfiguredRejectUnauthorized() };
}

export function getPgPoolConfig(connectionString: string = process.env.DATABASE_URL || ""): PoolConfig {
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set");
  }

  const ssl = buildSslConfig(connectionString);
  const sanitizedConnectionString = stripSslQueryParams(connectionString);
  return ssl === undefined ? { connectionString: sanitizedConnectionString } : { connectionString: sanitizedConnectionString, ssl };
}
