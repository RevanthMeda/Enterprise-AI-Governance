import fs from "fs";
import path from "path";
import { isVercelRuntime } from "./env";

function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

function getWritableRoot(): string {
  if (isVercelRuntime()) {
    return "/tmp/ai-control-tower";
  }

  return process.cwd();
}

export function getUploadsRoot(): string {
  return ensureDir(
    process.env.UPLOAD_ROOT || path.join(getWritableRoot(), "uploads"),
  );
}

export function getExportsRoot(): string {
  return ensureDir(
    process.env.EXPORTS_ROOT || path.join(getWritableRoot(), "exports"),
  );
}
