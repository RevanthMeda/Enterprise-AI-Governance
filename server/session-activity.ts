import type { NextFunction, Request, Response } from "express";

export function createSessionActivityMiddleware(options: {
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  clearCookie: (res: Response) => void;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.isAuthenticated?.()) {
      return next();
    }

    const now = Date.now();
    if (!req.session.createdAt) req.session.createdAt = now;
    if (!req.session.lastActivityAt) req.session.lastActivityAt = now;

    const idleDuration = now - (req.session.lastActivityAt ?? now);
    const absoluteDuration = now - (req.session.createdAt ?? now);

    if (
      idleDuration > options.idleTimeoutMs ||
      absoluteDuration > options.absoluteTimeoutMs
    ) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return req.logout((logoutError) => {
        if (logoutError) return next(logoutError);
        req.session.destroy((destroyError) => {
          if (destroyError) return next(destroyError);
          options.clearCookie(res);
          return res.status(401).json({ message: "Session expired. Please sign in again." });
        });
      });
    }

    req.session.lastActivityAt = now;
    return next();
  };
}
