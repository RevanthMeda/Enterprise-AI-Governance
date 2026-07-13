import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("billing never exposes editable defaults when subscription loading fails", async () => {
  const source = await readFile("client/src/pages/billing.tsx", "utf8");

  assert.match(source, /Subscription details could not be loaded/);
  assert.match(source, /Editing is disabled/);
  assert.match(source, /subscriptionUnavailable \? "—"/);
  assert.match(source, /disabled=\{updateMutation\.isPending \|\| !subscriptionQuery\.data\}/);
});

test("core governance dashboards expose retryable errors instead of false zero states", async () => {
  const expectations = [
    ["client/src/pages/dashboard.tsx", "Dashboard data could not be fully loaded"],
    ["client/src/pages/decision-trace.tsx", "Decision trace data could not be fully loaded"],
    ["client/src/pages/exit-readiness.tsx", "Exit readiness could not be loaded"],
    ["client/src/pages/analytics-center.tsx", "Analytics could not be loaded"],
    ["client/src/pages/governance-maturity.tsx", "Governance maturity could not be loaded"],
    ["client/src/pages/my-activity.tsx", "Activity data could not be loaded"],
    ["client/src/pages/telemetry-policy.tsx", "Telemetry policy could not be loaded"],
  ] as const;

  for (const [file, marker] of expectations) {
    const source = await readFile(file, "utf8");
    assert.match(source, /isError|Error/);
    assert.ok(source.includes(marker), `${file} is missing its explicit error state`);
    assert.match(source, /Retry/);
  }
});

test("new-organization guidance requires a successful summary response", async () => {
  const [decisionTrace, exitReadiness] = await Promise.all([
    readFile("client/src/pages/decision-trace.tsx", "utf8"),
    readFile("client/src/pages/exit-readiness.tsx", "utf8"),
  ]);

  assert.match(decisionTrace, /const summaryData = summaryQuery\.isError \? undefined : summaryQuery\.data/);
  assert.match(decisionTrace, /Boolean\(summaryData\).*?!listQuery\.isError.*total === 0/);
  assert.match(exitReadiness, /Boolean\(readiness\).*summary\.workflows === 0/);
});

test("system detail distinguishes not-found from request failures and gates complete evidence exports", async () => {
  const source = await readFile("client/src/pages/system-detail.tsx", "utf8");

  assert.match(
    source,
    /response\.status === 404[\s\S]*?return null;[\s\S]*?throwIfResponseNotOk\(response\)/,
  );

  const primaryErrorIndex = source.indexOf("if (systemQuery.isError)");
  const notFoundIndex = source.indexOf("if (!system)");
  assert.ok(primaryErrorIndex >= 0 && notFoundIndex > primaryErrorIndex, "request failures must be handled before the not-found state");
  const primaryErrorState = source.slice(primaryErrorIndex, notFoundIndex);
  assert.match(primaryErrorState, /System details could not be loaded/);
  assert.match(primaryErrorState, /systemQuery\.refetch\(\)/);
  assert.match(primaryErrorState, /Retry/);

  for (const queryName of ["controlsQuery", "workflowsQuery", "auditLogsQuery", "complianceControlsQuery"]) {
    assert.ok(source.includes(`${queryName}.isPending`), `${queryName} must participate in loading state`);
    assert.ok(source.includes(`${queryName}.isError`), `${queryName} must participate in error state`);
    assert.ok(source.includes(`${queryName}.refetch()`), `${queryName} must participate in retry`);
  }

  assert.match(source, /const canExportEvidence =[\s\S]*?complianceControlsQuery\.data !== undefined/);
  assert.match(source, /if \(!canExportEvidence\) \{[\s\S]*?return;[\s\S]*?handleExportEvidence/);
  assert.match(source, /disabled=\{!canExportEvidence\}[\s\S]*?data-testid="button-export-evidence"/);
});

test("telemetry recommendations fail closed instead of displaying zero signals", async () => {
  const source = await readFile("client/src/pages/telemetry-policy.tsx", "utf8");
  const cardStart = source.indexOf("Data-driven recommendations</CardTitle>");
  const cardEnd = source.indexOf("Plain-English policy helper</CardTitle>");
  assert.ok(cardStart >= 0 && cardEnd > cardStart, "recommendations card could not be located");
  const card = source.slice(cardStart, cardEnd);

  const loadingIndex = card.indexOf("recommendationsQuery.isLoading");
  const errorIndex = card.indexOf("recommendationsQuery.isError");
  const signalsIndex = card.indexOf("recommendationsQuery.data.signalSummary");
  assert.ok(loadingIndex >= 0 && errorIndex > loadingIndex && signalsIndex > errorIndex, "loading and error states must precede signal rendering");
  assert.match(card, /Data-driven recommendations could not be loaded/);
  assert.match(card, /recommendationsQuery\.refetch\(\)/);
  assert.doesNotMatch(card, /signalSummary\.[A-Za-z]+ \?\? 0/);
});

test("decision traces hide cached summary data and distinguish list or version failures from empty states", async () => {
  const source = await readFile("client/src/pages/decision-trace.tsx", "utf8");

  assert.match(source, /const summaryData = summaryQuery\.isError \? undefined : summaryQuery\.data/);
  const metricsStart = source.indexOf('<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">');
  const metricsEnd = source.indexOf("{hasNoTraces ? (", metricsStart);
  const metrics = source.slice(metricsStart, metricsEnd);
  assert.match(metrics, /value=\{summaryData\?\.total\}/);
  assert.doesNotMatch(metrics, /value=\{summaryQuery\.data/);

  const listErrorIndex = source.indexOf(") : listQuery.isError ? (");
  const listEmptyIndex = source.indexOf(") : recentTraces.length === 0 ? (");
  assert.ok(listErrorIndex >= 0 && listEmptyIndex > listErrorIndex, "list errors must be handled before the empty state");
  const listErrorState = source.slice(listErrorIndex, listEmptyIndex);
  assert.match(listErrorState, /Decision trace list could not be loaded/);
  assert.match(listErrorState, /listQuery\.refetch\(\)/);

  const versionErrorIndex = source.indexOf(") : versionsQuery.isError ? (");
  const versionEmptyIndex = source.indexOf(") : (versionsQuery.data?.length ?? 0) === 0 ? (");
  assert.ok(versionErrorIndex >= 0 && versionEmptyIndex > versionErrorIndex, "version errors must be handled before the empty state");
  const versionErrorState = source.slice(versionErrorIndex, versionEmptyIndex);
  assert.match(versionErrorState, /Version history could not be loaded/);
  assert.match(versionErrorState, /versionsQuery\.refetch\(\)/);
  assert.match(source, /coreQueryError =[\s\S]*?versionsQuery\.isError/);
});

test("evidence queries expose retryable unavailable states instead of false empty counts", async () => {
  const source = await readFile("client/src/components/evidence-upload.tsx", "utf8");

  assert.match(source, /isError=\{filesQuery\.isError\}/);
  assert.match(source, /onRetry=\{\(\) => void filesQuery\.refetch\(\)\}/);

  const compactStart = source.indexOf("const compactLabel");
  const compactEnd = source.indexOf("return (", compactStart);
  const compactLabel = source.slice(compactStart, compactEnd);
  assert.ok(
    compactLabel.indexOf("filesQuery.isError") < compactLabel.indexOf("files.length > 0"),
    "compact evidence errors must be handled before attachment counts",
  );
  assert.match(compactLabel, /Evidence unavailable/);

  const contentStart = source.indexOf("function EvidenceContent");
  const countStart = source.indexOf("export function EvidenceCount");
  const content = source.slice(contentStart, countStart);
  assert.ok(content.indexOf("isError ?") < content.indexOf("files.length > 0 ?"));
  assert.match(content, /Evidence files could not be loaded/);
  assert.match(content, /onClick=\{onRetry\}/);

  const count = source.slice(countStart);
  assert.ok(
    count.indexOf("evidenceCountQuery.isError") < count.indexOf("files.length === 0"),
    "evidence count errors must be handled before the successful zero-file state",
  );
  assert.match(count, /Evidence unavailable/);
  assert.match(count, /evidenceCountQuery\.refetch\(\)/);
});

test("evidence upload component always resets progress and the file input", async () => {
  const source = await readFile("client/src/components/evidence-upload.tsx", "utf8");
  const uploadStart = source.indexOf("const handleUpload = async");
  const uploadEnd = source.indexOf("const handleDrop", uploadStart);
  const uploadHandler = source.slice(uploadStart, uploadEnd);

  assert.match(uploadHandler, /setUploading\(true\)/);
  assert.match(uploadHandler, /runEvidenceUploads\(/);
  assert.match(uploadHandler, /setUploading\(false\)/);
  assert.match(uploadHandler, /fileInputRef\.current\.value = ""/);
  assert.ok(
    uploadHandler.indexOf("setUploading(false)") < uploadHandler.indexOf("fileInputRef.current.value"),
    "progress and file-input cleanup must share the upload batch cleanup callback",
  );
});
