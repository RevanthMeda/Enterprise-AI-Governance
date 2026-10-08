# FUXA PR #2586 explicit hexadecimal write validation

Target: `frangoteam/FUXA` PR #2586, feature commit
`1b31f6e9778f244055c68a3a5d0356546beb97d3`.

The adjacent `generic-enip-explicit-hex.patch` is an apply-ready fix plus 15
regression tests. It preserves opaque explicit-write hex strings while retaining
configured write scripts and scalar conversion for symbolic writes.

`generic-enip-wire.cjs` adds 16 integration checks using the real
`st-ethernet-ip@2.7.5` Controller and a Node TCP loopback peer on port 44818.
Neither the controller nor its packet encoder is mocked. The peer independently
parses encapsulation/CPF/CIP requests and checks class 4, instance 100,
attribute 3 and the exact payload bytes. It supports only the protocol subset
needed by these tests; it is not a PLC simulator or a conformance test.

Checks cover numeric-only hex, leading zeros, scalar scaling bypass, identity
and transforming write scripts, case/whitespace, configured buffers, malformed
payload rejection without transmission, a nonzero CIP status, recovery after
the rejection, delayed acknowledgement, Forward Close and zero remaining
accepted TCP sockets. RegisterSession and Forward Open must also succeed.

The original code must fail exactly five named wire assertions while passing
the other eleven. This explicit baseline verification makes the original CI
job successful only when the expected bug is reproduced. The patched code
must pass all sixteen. Unit regression tests independently verify the same
five original failures, including existing symbolic scalar behavior.

Run against a checkout after installing FUXA's declared server dependencies:

```sh
npm install --prefix /tmp/enip-wire --ignore-scripts --no-audit --no-fund --save-exact st-ethernet-ip@2.7.5
NODE_PATH=/tmp/enip-wire/node_modules FUXA_ROOT=/absolute/path/to/FUXA \
  REPORT_PATH=/tmp/wire-report.json timeout 60 node generic-enip-wire.cjs
```

Set `REVISION=original` only when checking the unpatched feature commit.
The library retains short-lived timeout timers after successful operations,
so normal process completion can take about ten seconds after the report.

The QA workflow is confined to `test/fuxa-enip-review` in
`RevanthMeda/Enterprise-AI-Governance`. It does not deploy anything. This is
external validation of FUXA code, not an upstream FUXA required check.

The backend suite needs the separately documented, pre-existing Linux storage
test import case correction (`apikeysStorage` to `apiKeysStorage`) to run.
That correction and the loopback fixture are not included in the upstream fix
patch. Expected backend totals: original 270 passing tests excluding the new
regressions; patched 285 passing tests including all 15 new tests.

Physical PLC hardware, implicit UDP assembly I/O, symbolic wire writes,
discovery, browser UI and full protocol conformance remain untested here.
AI assistance: OpenAI Codex assisted with the fix and validation fixtures.
