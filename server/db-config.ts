import type { PoolConfig } from "pg";

type PgSslConfig = NonNullable<PoolConfig["ssl"]>;

function stripSslQueryParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    [
      "sslmode",
      "ssl",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "sslaccept",
    ].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return connectionString;
  }
}

function getConfiguredSslMode(connectionString: string): string | null {
  const explicitMode = process.env.DB_SSL_MODE ?? process.env.PGSSLMODE;
  if (explicitMode) return explicitMode.trim().toLowerCase();

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");
    return sslMode ? sslMode.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function getConfiguredRejectUnauthorized(): boolean {
  const explicit = process.env.DB_SSL_REJECT_UNAUTHORIZED ?? process.env.PGSSL_REJECT_UNAUTHORIZED;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.NODE_ENV === "production";
}

function buildSslConfig(connectionString: string): PgSslConfig | undefined {
  const sslMode = getConfiguredSslMode(connectionString);

  if (!sslMode || sslMode === "disable" || sslMode === "allow") {
    return undefined;
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
  return ssl ? { connectionString: sanitizedConnectionString, ssl } : { connectionString: sanitizedConnectionString };
}
