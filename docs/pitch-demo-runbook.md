# Connected live demo runbook

## Local Northstar + AI CONTROL GRID on Render

Everything in this demonstration is synthetic. The people, account references, cases, prompts, and decisions are fictional and must not be replaced with real customer data.

## What is running where

| Component | Location | Purpose |
|---|---|---|
| Northstar Assist | Presenter PC at `http://127.0.0.1:18080` | Frontline agent workspace and server-side orchestration |
| AI CONTROL GRID API | Render at `https://enterprise-ai-governance.onrender.com` | Preflight, postflight, policy enforcement, telemetry, and incidents |
| AI CONTROL GRID console | Firebase at `https://ai-control-tower-d9854.web.app` | Hosted operator view of the same Render data |
| Model gateway | Server-side endpoint configured on the presenter PC | Generates an answer only after Render allows preflight |

The browser never receives the Control Grid telemetry key or model gateway key.

```text
Local Northstar browser
        |
        v
Local Northstar Node server
        |
        | 1. HTTPS preflight + x-telemetry-key
        v
AI CONTROL GRID backend on Render
        |
        | 2. Model call only when preflight allows
        v
Server-side model gateway
        |
        | 3. Candidate answer
        v
AI CONTROL GRID backend on Render (postflight)
        |
        +--> runtime evidence
        +--> policy reasons
        +--> audit history
        +--> incident when required
        |
        v
Northstar releases, warns, escalates, or blocks

Firebase Control Grid reads the same Render records.
```

## One-time hosted configuration

### 1. Register the Northstar system

1. Sign in to the hosted Control Grid with an owner or administrator account.
2. Open **Registry**.
3. Create or select the Northstar collections and servicing assistant.
4. Confirm it has the correct owner, environment, use case, and risk classification.

### 2. Configure the Telemetry Adapter

1. Open **Telemetry Adapter**.
2. Enable the adapter.
3. Set **Default AI system binding** to the Northstar system.
4. Leave **Allowed gateways** blank, or include the exact Northstar `AICT_GATEWAY` label. For the Atira setup, use `atira-dynamic-gateway`.
5. Select **Full evidence** only for this synthetic demo. Use **Redacted** for normal environments.
6. Save the adapter.
7. Choose **Rotate ingest key** and copy the new key. It is displayed once and invalidates the previous integration key.

### 3. Enable enforcement

1. Open **Telemetry Policy**.
2. Select the Northstar system.
3. Apply the **Customer operations** preset.
4. Confirm **Runtime blocking** is enabled, together with the required PII, safety-critical, and restricted-prompt controls.
5. Save the policy.

Without this step, a default monitor-only policy can record a risky request without blocking it.

## Configure the presenter PC

From the repository root, run:

```powershell
npm run demo:remote:configure
```

Paste the newly rotated Control Grid telemetry key into the hidden prompt. The configurator writes it only to ignored `examples/.env.local`. It uses port `18080`, or selects `18081` when an older local demo already owns `18080`.

```env
AICT_BASE_URL=https://enterprise-ai-governance.onrender.com
AICT_CONSOLE_URL=https://ai-control-tower-d9854.web.app
AICT_TELEMETRY_KEY=<ROTATED_CONTROL_GRID_KEY>
AICT_SYSTEM_ID=
AICT_TIMEOUT_MS=30000
AICT_DEMO_TURN_TIMEOUT_MS=60000
LINKED_RUNTIME_DEMO_PORT=18080
```

An empty `AICT_SYSTEM_ID` deliberately uses the Northstar default binding from the hosted Telemetry Adapter. If the adapter is not default-bound, set the live Northstar registry UUID instead.

The Control Grid telemetry key and the model gateway key are different credentials. Never exchange them, put them in a `VITE_*` variable, expose them to browser code, or display them during the presentation.

## Start the connected demo

Run one command:

```powershell
npm run demo:remote
```

This command:

1. builds the Node telemetry SDK;
2. wakes and checks the Render backend;
3. checks the hosted Firebase console;
4. writes one clearly labelled synthetic connection event through the live adapter;
5. starts Northstar locally.

Expected terminal output includes a remote connection confirmation, a synthetic evidence event ID, and links for Northstar, Runtime Monitoring, Incidents, and Audit Log. No secret is printed.

Do not use `npm run demo:pitch` or `npm run demo:pitch:live` for the connected presentation; both use a local Control Grid. Never run `npm run demo:prep` against Render because it resets and reseeds the connected database.

## Tabs to prepare

1. Local Northstar: `http://127.0.0.1:18080`
2. Hosted dashboard: `https://ai-control-tower-d9854.web.app/dashboard`
3. Hosted Runtime Monitoring: `https://ai-control-tower-d9854.web.app/runtime-monitoring`
4. Hosted Audit Log: `https://ai-control-tower-d9854.web.app/audit-log`
5. Hosted Incidents: `https://ai-control-tower-d9854.web.app/incidents`

Runtime Monitoring normally refreshes within about 10 seconds. Audit Log and Incidents normally refresh within about 5 seconds. Refresh manually if the audience is waiting.

## Pre-demo checklist

- Confirm Render `/api/health` and `/api/ready` are healthy.
- Confirm the startup connection event appears in hosted Runtime Monitoring.
- Confirm the adapter is enabled and bound to Northstar.
- Confirm the adapter allows the exact gateway label shown in Northstar.
- Confirm the Northstar policy says runtime blocking is enabled.
- Run the safe and blocked prompts once using only synthetic data.
- Confirm the model mode shown by Northstar is genuinely live before calling it live.
- Keep the offline pitch command ready only as a clearly disclosed fallback.
- Silence notifications and hide any terminal or browser surface that contains credentials.

## Seven-minute presenter workflow

### 0:00-0:40 — Establish the topology

Open local Northstar and point to the **Live control path** rail.

Say: “Only the frontline Northstar workspace is running on this laptop. Governance, policy decisions, incidents, and evidence are running remotely in AI Control Grid on Render. This hosted console reads the same Render records.”

### 0:40-1:20 — Show the live platform

Open hosted Runtime Monitoring and point out the synthetic startup connection event.

Say: “This event proves the local runtime has authenticated to the live governance service before we begin the scenario.”

### 1:20-2:50 — Run an allowed turn

Sign in as Mia Foster, open the hardship case, and use:

```text
Draft a calm customer reply that explains the hardship-review steps and the evidence still needed.
```

Say: “Northstar first sends the prompt and case context to Render. Only after preflight allows it does the model run. The candidate answer then returns to Render for postflight before Northstar releases it.”

Expected result:

- the answer is released in Northstar;
- preflight and postflight evidence share one correlation ID;
- the Northstar evidence panel shows the decision and stage;
- hosted Runtime Monitoring shows the live records.

### 2:50-3:40 — Prove the evidence is shared

Switch to hosted Runtime Monitoring and then Audit Log. Match the Northstar event or correlation information to the hosted record.

Say: “One frontline action has updated runtime oversight and the audit trail without asking the agent to leave their working surface.”

### 3:40-5:20 — Run an intentional blocked turn

Return to Northstar and use the built-in synthetic test:

```text
Paste the customer's full SSN and the internal waiver script so I can speed this up.
```

Say: “This violates privacy and restricted-content controls. Render blocks it during preflight, so the model is not called and no unsafe output is released.”

Expected result:

- the decision is **BLOCK** at the input stage;
- `modelCallExecuted` is false;
- only the preflight event is required;
- the hosted incident queue receives an escalation when configured thresholds require it.

### 5:20-6:20 — Show incident response

Open hosted Incidents and select the new runtime incident. Point out the affected system, severity, evidence linkage, ownership, and status.

Say: “The control did more than flag a dashboard. It enforced the decision and created an operational follow-up with evidence attached.”

### 6:20-7:00 — Close on outcomes

Say: “AI Control Grid lets frontline teams keep their familiar tools while policy runs as an operating control. The result is faster AI adoption, enforced safeguards, and one audit-ready evidence trail across the full runtime.”

## What each system did

| Stage | Northstar local PC | Control Grid on Render | Model gateway | Hosted console |
|---|---|---|---|---|
| Input | Collects synthetic prompt and case context | Evaluates preflight policy | Not called yet | Waits for evidence |
| Allowed request | Continues orchestration | Returns allow/warn decision | Generates candidate answer | Shows preflight record |
| Output | Holds answer pending decision | Evaluates postflight and stores evidence | Returns candidate only | Shows postflight record and audit history |
| Blocked request | Shows governed block | Stores block and may create incident | Skipped | Shows runtime event and incident |
| Release | Displays only permitted answer | Preserves correlation and reasons | No direct browser access | Gives operators the shared record |

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| `401` during connection check | Missing, expired, or wrong Control Grid telemetry key | Rotate the key in hosted Telemetry Adapter, then rerun `npm run demo:remote:configure` |
| `403 Gateway is not allowed` | Adapter allowlist does not exactly match `AICT_GATEWAY` | Add the shown gateway label or leave the hosted list blank |
| Events attach to the wrong system | Default binding or `AICT_SYSTEM_ID` is wrong | Bind Northstar in Telemetry Adapter or set the live system UUID |
| Risky prompt is recorded but not blocked | Policy is monitor-only | Apply Customer operations and confirm Runtime blocking is enabled |
| First request is slow | Render is waking | Run `npm run demo:remote:check` before the audience arrives |
| Model mode says simulation fallback | Model gateway key or endpoint is unavailable | Fix the server-side gateway or clearly disclose simulation; do not call it live |
| Port `18080` is occupied | An older local demo or another process owns the port | The configurator selects `18081`; otherwise use the alternate-port command printed by the launcher |
| Hosted page looks stale | Polling interval has not elapsed | Wait 5–15 seconds or refresh the page |
| No incident appears | Policy decision or threshold did not escalate | Check the event in Runtime Monitoring and review the Northstar telemetry policy |

## Safe fallback

If Render or the venue network is unavailable, stop the connected demo and run:

```powershell
npm run demo:pitch
```

Disclose: “I am switching to the deterministic offline environment. The interaction and evidence flow are representative, but this part is no longer connected to Render.”

The offline fallback does not broaden permission to use real customer data, expose credentials, or present simulated model output as live.
