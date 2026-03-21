import { randomBytes } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/sso/callback",
]);

export function applySecurityHeaders(app: Express) {
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https:",
        ].join("; "),
      );
      res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    } else {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob:",
          "connect-src 'self' ws: wss: http: https:",
        ].join("; "),
      );
    }
    next();
  });
}

export function createCsrfMiddleware(options?: {
  enforced?: boolean;
  exemptPaths?: string[];
}) {
  const enforced = options?.enforced ?? false;
  const exemptPaths = new Set([
    ...Array.from(DEFAULT_CSRF_EXEMPT_PATHS),
    ...(options?.exemptPaths ?? []),
  ]);

  function isExemptPath(requestPath: string) {
    for (const exemptPath of Array.from(exemptPaths)) {
      if (exemptPath.endsWith("*")) {
        const prefix = exemptPath.slice(0, -1);
        if (requestPath.startsWith(prefix)) {
          return true;
        }
        continue;
      }

      if (requestPath === exemptPath) {
        return true;
      }
    }

    return false;
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) {
      return next();
    }

    if (req.session) {
      if (!req.session.csrfToken) {
        req.session.csrfToken = randomBytes(32).toString("hex");
      }
      res.setHeader("X-CSRF-Token", req.session.csrfToken);
    }

    if (!enforced) {
      return next();
    }

    const requestMethod = req.method.toUpperCase();
    if (CSRF_SAFE_METHODS.has(requestMethod) || isExemptPath(req.path)) {
      return next();
    }

    const csrfToken = req.session?.csrfToken;
    const requestToken = req.get("x-csrf-token");
    if (!csrfToken || !requestToken || requestToken !== csrfToken) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    return next();
  };
}
