# Semgrep execution and findings policy

The Security workflow runs the Community Edition CLI pinned in `script/requirements-semgrep.txt`. Version upgrades require review. It replaces the deprecated `returntocorp/semgrep-action@v1`, whose scanner could crash while the workflow still reported success (issue #51).

## Gate contract

`node script/semgrep-gate.mjs` scans the repository with all three existing registry packs:

- `p/owasp-top-ten`
- `p/nodejs`
- `p/secrets`

The wrapper invokes `semgrep scan --strict --error --oss-only`, with metrics and version checks disabled. Registry rules are fetched from Semgrep; the CLI is pinned, but these registry packs are not immutable snapshots. No Semgrep account/token is required. The wrapper removes inherited platform-token, rule and baseline overrides so this is a standalone full scan rather than an accidental platform/diff-aware scan.

The policy is deliberately explicit:

| Result | Wrapper exit | Gate |
| --- | --- | --- |
| Completed scan, no findings/errors, at least one scanned file | 0 | Passed |
| Completed scan with findings | 1 | Blocked; findings require review |
| Scanner/configuration error, killed/missing process, missing/malformed report, wrong version or no scanned files | 2 | Failed; scan completion is not established |

Findings are not treated as a successful security assessment. Scanner failures are not suppressed. A nominal exit zero is insufficient if the JSON report contains errors or is incomplete. There is no baseline or new rule/file exclusion to hide pre-existing findings.

The optional first argument writes a sanitized JSON summary. CI retains that summary for seven days, including on a blocked/failed gate. It contains counts, completion state, CLI version and configuration names, not source snippets or finding contents. The raw scanner JSON is temporary and is removed after evaluation. Check the job's Semgrep stderr for scanner/configuration diagnostics.

## Regression validation

```bash
npm run test:ci:semgrep
```

The dependency-free Node tests exercise exit/error propagation, malformed and contradictory reports, empty scans, findings, the mandatory flags and workflow wiring. They run in Security and Regression Safeguards.

After installing the pinned CLI in a virtual environment and putting it on PATH:

```bash
npm run test:ci:semgrep:integration
```

These tests run the actual CLI against temporary synthetic JavaScript/rules: a clean scan with MEDIUM severity, a matching finding, invalid YAML, an invalid pattern and a missing executable. Security runs them before scanning the real repository. `SEMGREP_BIN` can identify a local CLI executable without changing the pin or scan flags.

They also copy the five application pages and deployment workflow that previously produced `PartialParsing` diagnostics into a temporary directory and scan them with the same three production packs. This case requires all six files to be scanned with zero diagnostics; findings must still produce a blocked gate. Minimal syntax-only rules did not reproduce the embedded parsing errors, so they are not used as a substitute for this regression. Network access to the rule registry is required, just as for the full repository scan.

The pages use entity-encoded ampersands in JSX text/attributes. A TypeScript emit comparison checks that these labels compile to exactly the same JavaScript as their raw-ampersand equivalents. The deployment summary passes its hook status through an environment variable; a real Bash test checks literal output for true/false/empty and shell-like values. These compatibility changes neither add exclusions nor alter deployment conditions.

Passing synthetic cases establishes the gate behavior, not that the repository scan is clean. Required checks must be reviewed against the actual proposed commit. This change does not resolve the independent provider/deployment audit in issue #45 or authorize a production release.

Official references:

- [CLI flags and exit codes](https://semgrep.dev/docs/cli-reference)
- [Semgrep CE in GitHub Actions](https://semgrep.dev/docs/semgrep-ci/sample-ci-configs)
- [Pinned 1.181.0 release](https://github.com/semgrep/semgrep/releases/tag/v1.181.0)
