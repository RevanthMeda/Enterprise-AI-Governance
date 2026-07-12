import type { Response } from "express";

export const AUTHENTICATION_REQUIRED_ERROR_CODE = "AUTHENTICATION_REQUIRED";
export const SESSION_EXPIRED_ERROR_CODE = "SESSION_EXPIRED";

function setAuthenticationNoStoreHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export function sendAuthenticationRequired(res: Response): Response {
  setAuthenticationNoStoreHeaders(res);
  res.setHeader("X-Error-Code", AUTHENTICATION_REQUIRED_ERROR_CODE);
  return res.status(401).json({ message: "Authentication required" });
}

export function sendSessionExpired(res: Response): Response {
  setAuthenticationNoStoreHeaders(res);
  res.setHeader("X-Error-Code", SESSION_EXPIRED_ERROR_CODE);
  return res.status(401).json({ message: "Session expired. Please sign in again." });
}
