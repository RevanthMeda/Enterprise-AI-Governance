import fs from "fs";
import os from "os";
import path from "path";
import {
  isVercelRuntime,
  normalizeOptionalString,
  parseBooleanEnv,
} from "./env";
import { getUploadsRoot } from "./runtime-paths";

export type ReleaseIdentity = {
  commit: string | null;
};

export type EvidenceStorageReadiness = {
  ready: boolean;
  configured: boolean;
  writable: boolean;
  durable: boolean;
  required: boolean;
  code: "EVIDENCE_STORAGE_UNWRITABLE" | "EVIDENCE_STORAGE_NOT_DURABLE" | null;
};

function normalizeCommit(value: string | undefined): string | null {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized && /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : null;
}

export function getReleaseIdentity(
  env: NodeJS.ProcessEnv = process.env,
): ReleaseIdentity {
  return {
    commit:
      normalizeCommit(env.RENDER_GIT_COMMIT) ??
      normalizeCommit(env.RELEASE_COMMIT_SHA),
  };
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isKnownEphemeralRoot(root: string, env: NodeJS.ProcessEnv): boolean {
  if (isVercelRuntime(env)) {
    return true;
  }

  return isPathInside(os.tmpdir(), root) || /^\/tmp(?:\/|$)/.test(root.replace(/\\/g, "/"));
}

export function getEvidenceStorageReadiness(
  env: NodeJS.ProcessEnv = process.env,
): EvidenceStorageReadiness {
  const configuredRoot = normalizeOptionalString(env.UPLOAD_ROOT);
  const root = getUploadsRoot(env);
  let writable = false;

  try {
    fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  // Local filesystem storage cannot prove that a hosting volume survives a
  // redeploy. The operator must explicitly attest that UPLOAD_ROOT is mounted
  // on durable storage. Known temporary/serverless paths never qualify.
  const durable = Boolean(
    configuredRoot &&
      path.isAbsolute(configuredRoot) &&
      parseBooleanEnv(env.EVIDENCE_STORAGE_DURABLE, false) &&
      !isKnownEphemeralRoot(root, env),
  );
  const required = parseBooleanEnv(env.REQUIRE_DURABLE_EVIDENCE_STORAGE, false);
  const ready = writable && (!required || durable);

  return {
    ready,
    configured: Boolean(configuredRoot),
    writable,
    durable,
    required,
    code: !writable
      ? "EVIDENCE_STORAGE_UNWRITABLE"
      : required && !durable
        ? "EVIDENCE_STORAGE_NOT_DURABLE"
        : !durable
          ? "EVIDENCE_STORAGE_NOT_DURABLE"
          : null,
  };
}
