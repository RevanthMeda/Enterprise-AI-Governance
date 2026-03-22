import "./load-env";

export type SameSitePolicy = "lax" | "strict" | "none";

export type RuntimeConfig = {
  isProduction: boolean;
  allowedCorsOrigins: string[];
  csrfEnforced: boolean;
  trustProxy: boolean;
  sessionCookieSameSite: SameSitePolicy;
  sessionCookieSecure: boolean;
  publicAppUrl: string | null;
};

export type SmtpEnvironmentConfig = {
  host?: string;
  port?: string;
  secure?: string;
  user?: string;
  pass?: string;
  from?: string;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV || "development") === "production";
}

export function normalizeOptionalString(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function parseBooleanEnv(value: string | undefined | null, defaultValue = false): boolean {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return defaultValue;
}

export function getSmtpEnvironmentConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmtpEnvironmentConfig {
  return {
    host: normalizeOptionalString(env.SMTP_HOST) ?? normalizeOptionalString(env.SMTP_SERVER),
    port: normalizeOptionalString(env.SMTP_PORT),
    secure: normalizeOptionalString(env.SMTP_SECURE),
    user: normalizeOptionalString(env.SMTP_USER) ?? normalizeOptionalString(env.SMTP_USERNAME),
    pass: normalizeOptionalString(env.SMTP_PASSWORD),
    from: normalizeOptionalString(env.SMTP_FROM) ?? normalizeOptionalString(env.DEFAULT_SENDER),
  };
}

export function isVercelRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBooleanEnv(env.VERCEL, false);
}

export function parseSameSitePolicy(
  value: string | undefined | null,
  defaultValue: SameSitePolicy,
): SameSitePolicy {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized === "lax" || normalized === "strict" || normalized === "none") {
    return normalized;
  }
  return defaultValue;
}

export function areMockAuthRoutesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const isProduction = isProductionEnvironment(env);
  return !isProduction || parseBooleanEnv(env.ENABLE_TEST_AUTH_ROUTES, false);
}

function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (
      (url.pathname && url.pathname !== "/") ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function looksLikePlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<") ||
    normalized.endsWith(">") ||
    normalized.includes("changeme") ||
    normalized.includes("replace-me") ||
    normalized.includes("replace_this") ||
    normalized.includes("set-a-") ||
    normalized.includes("set-your-") ||
    normalized.includes("your-secret")
  );
}

function looksLikePlaceholderHost(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return (
      url.hostname === "example.com" ||
      url.hostname.endsWith(".example") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function validateOriginList(
  rawValue: string | undefined,
  label: string,
  errors: string[],
  requireHttps: boolean,
): string[] {
  if (!rawValue) {
    return [];
  }

  const rawOrigins = rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const normalizedOrigins: string[] = [];
  for (const origin of rawOrigins) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) {
      errors.push(`${label} contains an invalid origin: ${origin}`);
      continue;
    }

    if (requireHttps && !normalized.startsWith("https://")) {
      errors.push(`${label} must use https in production: ${origin}`);
      continue;
    }

    normalizedOrigins.push(normalized);
  }

  return normalizedOrigins;
}

function validateSecret(
  name: string,
  rawValue: string | undefined,
  errors: string[],
  options?: {
    minLength?: number;
    disallowEqualTo?: string | undefined;
  },
) {
  const value = normalizeOptionalString(rawValue);
  const minLength = options?.minLength ?? 32;

  if (!value) {
    errors.push(`${name} must be set`);
    return;
  }

  if (value.length < minLength) {
    errors.push(`${name} must be at least ${minLength} characters long`);
  }

  if (looksLikePlaceholderSecret(value)) {
    errors.push(`${name} must not use a placeholder value`);
  }

  if (options?.disallowEqualTo && value === options.disallowEqualTo) {
    errors.push(`${name} must be different from the related application secret`);
  }
}

function validateOptionalWebhook(name: string, rawValue: string | undefined, errors: string[]) {
  const value = normalizeOptionalString(rawValue);
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push(`${name} must use https in production`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

function validateSmtpConfig(env: NodeJS.ProcessEnv, errors: string[], isProduction: boolean) {
  const { host, port, secure, user, pass, from } = getSmtpEnvironmentConfig(env);
  const provided = [host, port, secure, user, pass, from].filter(Boolean).length;

  if (provided === 0) {
    return;
  }

  if (!host || !from) {
    // Email delivery is optional. If the deployment only provides partial SMTP
    // values, treat SMTP as disabled and let the delivery services fall back to
    // webhook or preview behavior instead of aborting app startup.
    return;
  }

  if (port) {
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort <= 0 || numericPort > 65535) {
      errors.push("SMTP_PORT must be a valid TCP port number");
    }
  }

  if (secure && !TRUE_VALUES.has(secure.toLowerCase()) && !FALSE_VALUES.has(secure.toLowerCase())) {
    errors.push("SMTP_SECURE must be one of true/false/1/0/yes/no/on/off");
  }

  if (!from.includes("@")) {
    errors.push("SMTP_FROM must be a valid email address");
  }

  if (isProduction && (host.includes("example.com") || from.includes("example.com"))) {
    errors.push("SMTP_HOST and SMTP_FROM must not use example.com placeholders in production");
  }
}

export function getPublicAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configuredPublicUrl = normalizeOptionalString(
    env.PUBLIC_APP_URL || env.APP_BASE_URL || env.FRONTEND_URL,
  );
  if (configuredPublicUrl) {
    return configuredPublicUrl.replace(/\/+$/, "");
  }

  const firstAllowedOrigin = normalizeOptionalString(env.CORS_ALLOWED_ORIGINS || env.FRONTEND_ORIGINS)
    ?.split(",")
    .map((origin) => origin.trim())
    .find((origin) => origin.length > 0);

  return (firstAllowedOrigin || "http://localhost:5000").replace(/\/+$/, "");
}

export function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const isProduction = isProductionEnvironment(env);
  const allowedCorsOrigins = normalizeOptionalString(env.CORS_ALLOWED_ORIGINS || env.FRONTEND_ORIGINS)
    ?.split(",")
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin)) ?? [];
  const sessionCookieSameSite = parseSameSitePolicy(
    env.SESSION_COOKIE_SAME_SITE,
    isProduction ? "strict" : "lax",
  );
  const configuredCookieSecure = parseBooleanEnv(env.SESSION_COOKIE_SECURE, isProduction);
  const sessionCookieSecure =
    sessionCookieSameSite === "none" ? true : configuredCookieSecure;

  return {
    isProduction,
    allowedCorsOrigins,
    csrfEnforced: parseBooleanEnv(env.CSRF_ENFORCED, isProduction),
    trustProxy: parseBooleanEnv(env.TRUST_PROXY, isProduction),
    sessionCookieSameSite,
    sessionCookieSecure,
    publicAppUrl: normalizeOptionalString(
      env.PUBLIC_APP_URL || env.APP_BASE_URL || env.FRONTEND_URL,
    ) ?? null,
  };
}

export function validateRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const config = getRuntimeConfig(env);
  const errors: string[] = [];

  if (!normalizeOptionalString(env.DATABASE_URL)) {
    errors.push("DATABASE_URL must be set");
  }

  if (!normalizeOptionalString(env.SESSION_SECRET)) {
    errors.push("SESSION_SECRET must be set");
  }

  validateSmtpConfig(env, errors, config.isProduction);

  if (config.isProduction) {
    validateSecret("SESSION_SECRET", env.SESSION_SECRET, errors);
    validateSecret("PASSWORD_RESET_SECRET", env.PASSWORD_RESET_SECRET, errors, {
      disallowEqualTo: normalizeOptionalString(env.SESSION_SECRET),
    });
    validateSecret("CONTROL_TOWER_VAULT_SECRET", env.CONTROL_TOWER_VAULT_SECRET, errors, {
      disallowEqualTo: normalizeOptionalString(env.SESSION_SECRET),
    });

    const publicAppUrl = normalizeOptionalString(env.PUBLIC_APP_URL);
    if (!publicAppUrl) {
      errors.push("PUBLIC_APP_URL must be set in production");
    } else {
      const normalizedPublicOrigin = normalizeOrigin(publicAppUrl);
      if (!normalizedPublicOrigin) {
        errors.push("PUBLIC_APP_URL must be a valid origin URL without a path");
      } else {
        if (!normalizedPublicOrigin.startsWith("https://")) {
          errors.push("PUBLIC_APP_URL must use https in production");
        }
        if (looksLikePlaceholderHost(normalizedPublicOrigin)) {
          errors.push("PUBLIC_APP_URL must not use localhost or example hosts in production");
        }
      }
    }

    const allowedOrigins = validateOriginList(
      normalizeOptionalString(env.CORS_ALLOWED_ORIGINS || env.FRONTEND_ORIGINS),
      "CORS_ALLOWED_ORIGINS",
      errors,
      true,
    );
    if (allowedOrigins.length === 0) {
      errors.push("CORS_ALLOWED_ORIGINS or FRONTEND_ORIGINS must include at least one valid https origin in production");
    }

    const normalizedPublicOrigin = publicAppUrl ? normalizeOrigin(publicAppUrl) : null;
    if (normalizedPublicOrigin && allowedOrigins.length > 0 && !allowedOrigins.includes(normalizedPublicOrigin)) {
      errors.push("CORS_ALLOWED_ORIGINS must include the PUBLIC_APP_URL origin");
    }

    if (!config.csrfEnforced) {
      errors.push("CSRF_ENFORCED must not be false in production");
    }

    if (
      config.sessionCookieSameSite === "none" &&
      normalizeOptionalString(env.SESSION_COOKIE_SECURE)?.toLowerCase() === "false"
    ) {
      errors.push("SESSION_COOKIE_SECURE cannot be false when SESSION_COOKIE_SAME_SITE=none");
    }

    if (isVercelRuntime(env) && !normalizeOptionalString(env.CRON_SECRET)) {
      errors.push("CRON_SECRET must be set for Vercel production deployments");
    }

    validateOptionalWebhook("PASSWORD_RESET_WEBHOOK_URL", env.PASSWORD_RESET_WEBHOOK_URL, errors);
    validateOptionalWebhook("INVITE_WEBHOOK_URL", env.INVITE_WEBHOOK_URL, errors);
    validateOptionalWebhook("GOVERNANCE_EVENT_WEBHOOK_URL", env.GOVERNANCE_EVENT_WEBHOOK_URL, errors);
  }

  if (errors.length > 0) {
    throw new Error(`Runtime configuration is invalid:\n- ${errors.join("\n- ")}`);
  }

  return config;
}
