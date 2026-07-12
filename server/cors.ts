import type { Express } from "express";

export function applyCors(app: Express, configuredOrigins: string[]): void {
  const allowedOrigins = new Set(configuredOrigins);
  if (allowedOrigins.size === 0) {
    return;
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      return next();
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-CSRF-Token, X-Telemetry-Key, X-API-Key, Authorization",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE",
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-CSRF-Token, X-Error-Code",
    );
    res.append("Vary", "Origin");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  });
}
