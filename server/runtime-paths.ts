import fs from "fs";
import path from "path";
import { isVercelRuntime } from "./env";

function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

function getWritableRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (isVercelRuntime(env)) {
    return "/tmp/ai-control-grid";
  }

  return process.cwd();
}

export function getUploadsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return ensureDir(
    env.UPLOAD_ROOT || path.join(getWritableRoot(env), "uploads"),
  );
}

export function getExportsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return ensureDir(
    env.EXPORTS_ROOT || path.join(getWritableRoot(env), "exports"),
  );
}
