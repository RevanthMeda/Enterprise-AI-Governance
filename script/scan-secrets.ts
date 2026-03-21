import { readdir, readFile } from "fs/promises";
import path from "path";

const rootDir = process.cwd();

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".vite",
]);

const ignoredExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".mp4",
  ".mov",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".map",
]);

type SecretPattern = {
  name: string;
  regex: RegExp;
};

const secretEnvKeys = new Set([
  "API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "SMTP_PASSWORD",
  "DATABASE_URL",
  "SESSION_SECRET",
  "CONTROL_TOWER_VAULT_SECRET",
  "SECRET_KEY",
  "JWT_SECRET",
  "TOKEN",
  "ACCESS_KEY_ID",
  "SECRET_ACCESS_KEY",
]);

const secretPatterns: SecretPattern[] = [
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "AWS secret key pattern", regex: /aws(.{0,20})?(secret|access).{0,20}[A-Za-z0-9/+]{40}/gi },
  { name: "Private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g },
  { name: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,200}/g },
  { name: "Stripe secret key", regex: /sk_(?:live|test)_[A-Za-z0-9]{16,255}/g },
  { name: "Supabase service role key", regex: /sb_secret_[A-Za-z0-9._-]{20,}/g },
];

type Finding = {
  filePath: string;
  line: number;
  pattern: string;
  snippet: string;
};

async function collectFiles(dirPath: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      await collectFiles(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoredExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(fullPath);
  }

  return files;
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToLine(offset: number, lineStarts: number[]): number {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (lineStarts[mid] <= offset) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return right + 1;
}

function formatSnippet(line: string): string {
  return line.trim().slice(0, 160);
}

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.startsWith("<") ||
    normalized.includes("example.com") ||
    normalized.includes("your-project") ||
    normalized.includes("set-your") ||
    normalized.includes("changeme") ||
    normalized.includes("replace-me") ||
    normalized === "true" ||
    normalized === "false" ||
    normalized === "postgresql://postgres:postgres@localhost:5432/enterprise_ai_governance" ||
    normalized === "http://localhost:5000"
  );
}

function looksLikeEnvFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName === ".env" || fileName.startsWith(".env.") || fileName.endsWith(".env");
}

function looksLikeLocalOverrideEnvFile(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  return fileName === ".env.local" || fileName.startsWith(".env.") && fileName.endsWith(".local");
}

async function scanFile(filePath: string): Promise<Finding[]> {
  if (looksLikeLocalOverrideEnvFile(filePath)) {
    return [];
  }

  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);
  const lineStarts = buildLineStarts(content);

  for (const pattern of secretPatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match = regex.exec(content);
    while (match) {
      const lineNumber = offsetToLine(match.index, lineStarts);
      const lineText = lines[lineNumber - 1] ?? "";
      const nextLineText = lines[lineNumber] ?? "";

      if (
        lineText.includes("security-ignore-next-line") ||
        nextLineText.includes("security-ignore-next-line")
      ) {
        match = regex.exec(content);
        continue;
      }

      findings.push({
        filePath,
        line: lineNumber,
        pattern: pattern.name,
        snippet: formatSnippet(lineText),
      });
      match = regex.exec(content);
    }
  }

  if (looksLikeEnvFile(filePath)) {
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const separator = trimmed.indexOf("=");
      if (separator <= 0) return;

      const key = trimmed.slice(0, separator).trim().toUpperCase();
      const value = trimmed.slice(separator + 1).trim();
      if (!secretEnvKeys.has(key) || looksLikePlaceholder(value)) {
        return;
      }

      findings.push({
        filePath,
        line: index + 1,
        pattern: `Sensitive env var ${key}`,
        snippet: formatSnippet(line),
      });
    });
  }

  return findings;
}

async function main() {
  const files = await collectFiles(rootDir);
  const allFindings: Finding[] = [];

  for (const filePath of files) {
    const findings = await scanFile(filePath);
    allFindings.push(...findings);
  }

  if (allFindings.length === 0) {
    console.log("Secret scan passed. No high-confidence secrets detected.");
    return;
  }

  console.error(`Secret scan failed with ${allFindings.length} finding(s):`);
  for (const finding of allFindings) {
    const relativePath = path.relative(rootDir, finding.filePath);
    console.error(
      `${relativePath}:${finding.line} [${finding.pattern}] ${finding.snippet}`,
    );
  }

  process.exit(1);
}

main().catch((error) => {
  console.error("Secret scan error:", error);
  process.exit(1);
});
