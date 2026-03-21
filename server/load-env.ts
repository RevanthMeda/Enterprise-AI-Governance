import fs from "fs";
import path from "path";
import { parse } from "dotenv";

type LoadProjectEnvOptions = {
  rootDir?: string;
  targetEnv?: NodeJS.ProcessEnv;
};

let processEnvLoaded = false;

function getDefaultRootDir() {
  return path.resolve(process.cwd());
}

function readEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return parse(fs.readFileSync(filePath, "utf8"));
}

function applyEnvValues(
  envValues: Record<string, string>,
  targetEnv: NodeJS.ProcessEnv,
  originalKeys: Set<string>,
  allowOverrideLoadedValues: boolean,
) {
  for (const [key, value] of Object.entries(envValues)) {
    if (!key || originalKeys.has(key)) {
      continue;
    }

    if (!allowOverrideLoadedValues && targetEnv[key] !== undefined) {
      continue;
    }

    targetEnv[key] = value;
  }
}

export function loadProjectEnv(options: LoadProjectEnvOptions = {}) {
  const targetEnv = options.targetEnv ?? process.env;
  const rootDir = options.rootDir ?? getDefaultRootDir();
  const shouldMemoize = targetEnv === process.env && options.rootDir === undefined;

  if (shouldMemoize && processEnvLoaded) {
    return targetEnv;
  }

  const originalKeys = new Set(Object.keys(targetEnv));
  const envValues = readEnvFile(path.join(rootDir, ".env"));
  if (envValues) {
    applyEnvValues(envValues, targetEnv, originalKeys, false);
  }

  const localEnvValues = readEnvFile(path.join(rootDir, ".env.local"));
  if (localEnvValues) {
    applyEnvValues(localEnvValues, targetEnv, originalKeys, true);
  }

  if (shouldMemoize) {
    processEnvLoaded = true;
  }

  return targetEnv;
}

loadProjectEnv();
