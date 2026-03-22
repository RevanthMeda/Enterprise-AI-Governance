import fs from "fs/promises";
import path from "path";
import readline from "readline";

type CliOptions = {
  inputPath: string;
  outputPath: string;
  includeDecisions: Set<string> | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: path.resolve(process.cwd(), "exports/governance-training-data.jsonl"),
    outputPath: path.resolve(process.cwd(), "exports/governance-training-curated.jsonl"),
    includeDecisions: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--input=")) {
      options.inputPath = path.resolve(process.cwd(), arg.slice("--input=".length).trim());
    } else if (arg.startsWith("--output=")) {
      options.outputPath = path.resolve(process.cwd(), arg.slice("--output=".length).trim());
    } else if (arg.startsWith("--decisions=")) {
      options.includeDecisions = new Set(
        arg
          .slice("--decisions=".length)
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      );
    }
  }

  return options;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function buildTargetLabel(decision: string, reasonCodes: string[]) {
  if (decision === "block") {
    return "block";
  }
  if (decision === "escalate" || reasonCodes.includes("mixed_request_rewrite_available")) {
    return "rewrite";
  }
  return "allow";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const curated: string[] = [];

  const input = await fs.open(options.inputPath, "r");
  const rl = readline.createInterface({
    input: input.createReadStream(),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as Record<string, unknown>;
    if (record.recordType !== "telemetry_event") {
      continue;
    }

    const prompt = typeof record.promptText === "string" ? record.promptText : null;
    const output = typeof record.modelOutput === "string" ? record.modelOutput : null;
    const decision = typeof record.decision === "string" ? record.decision.toLowerCase() : "allow";
    if (!prompt || !output) {
      continue;
    }
    if (options.includeDecisions && !options.includeDecisions.has(decision)) {
      continue;
    }

    const governanceCritic = getRecord(record.governanceCritic);
    const reviewRelease = getRecord(record.reviewRelease);
    const shadowPolicy = getRecord(record.shadowPolicy);
    const reasonCodes = getStringArray(record.reasonCodes);

    curated.push(
      JSON.stringify({
        sourceId: record.id,
        organizationId: record.organizationId,
        systemId: record.systemId,
        prompt,
        output,
        decision,
        targetLabel: buildTargetLabel(decision, reasonCodes),
        reasonCodes,
        thresholdBreaches: getStringArray(record.thresholdBreaches),
        legalProfileApplied: typeof record.legalProfileApplied === "string" ? record.legalProfileApplied : "global",
        lawPackIdsApplied: getStringArray(record.lawPackIdsApplied),
        usefulForCritic: true,
        usefulForRewrite: decision === "escalate" || reasonCodes.includes("mixed_request_rewrite_available"),
        reviewReleased: reviewRelease.status === "released",
        shadowDecision: typeof shadowPolicy.decision === "string" ? shadowPolicy.decision : null,
        criticVerdict: typeof governanceCritic.verdict === "string" ? governanceCritic.verdict : null,
        createdAt: record.createdAt,
      }),
    );
  }

  await rl.close();
  await input.close();
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, `${curated.join("\n")}\n`, "utf8");
  console.log(`[curate-governance-training-data] wrote ${curated.length} records to ${options.outputPath}`);
}

main().catch((error) => {
  console.error("[curate-governance-training-data] failed:", error);
  process.exitCode = 1;
});
