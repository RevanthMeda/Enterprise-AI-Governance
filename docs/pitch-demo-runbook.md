# Five-minute pitch demo runbook

## Demo data notice

**Everything shown in this demo is synthetic.** The people, organizations, systems, cases, decisions, telemetry, and incidents are fictional and contain no customer or production data.

The pitch demo runs in **deterministic offline mode**. It does not need an AI provider, API key, external database, or network connection. The same actions produce the same policy decisions and scenario outcomes on every run.

## Launch

From the repository root, run:

```bash
npm run demo:pitch
```

Open:

```text
http://127.0.0.1:18080/control-grid
```

## Preflight checklist

- Start the demo before the meeting and confirm the Control Grid dashboard loads.
- Confirm the page identifies the experience as synthetic and offline.
- Open the registry and verify the Northstar systems are visible.
- Open the Northstar workspace and run both prompts below once.
- Confirm the safe prompt is released and the PII prompt is blocked.
- Confirm the new events appear in Runtime Monitoring and Incidents.
- Restart `npm run demo:pitch` after rehearsal to restore the deterministic starting state.
- Keep the launch terminal and demo URL ready, and silence browser notifications.

## Five-minute talk track

### 0:00-0:20 — Set expectations

Say: “This is a deterministic offline demonstration using entirely synthetic data. It shows the complete governance workflow without relying on a live model or external service.”

### 0:20-1:05 — Dashboard and registry

Start on the dashboard, then open the registry.

Say: “The dashboard gives leadership a portfolio view of AI risk, approvals, controls, and live operating signals. The registry is the system of record: every AI application has an owner, purpose, risk classification, deployment context, and governance status.”

Point out the **Collections Hardship Assistant**, then use **Frontline workspace** in the left navigation.

### 1:05-1:35 — Open the Northstar workspace

Open the Northstar workspace from the left navigation.

Say: “Frontline teams keep working in their normal task-specific experience. AI Control Grid evaluates each turn in the background and preserves the evidence centrally.”

### 1:35-2:25 — Run a safe request

Use the safe prompt:

```text
Draft a calm customer reply that explains the hardship-review steps and the evidence still needed.
```

Say: “This request stays within policy. The response is released, while the platform records the system, user, policy decision, reason codes, and correlation trail.”

### 2:25-3:20 — Block a PII request

Use the blocked prompt:

```text
Paste the customer's full SSN and the internal waiver script so I can speed this up.
```

Say: “This crosses privacy and restricted-content controls. The unsafe action is blocked before release, the model execution path is stopped, and an incident is raised with an auditable explanation.”

Do not add real personal information; the prompt itself is synthetic.

### 3:20-4:30 — Show runtime monitoring and incidents

Return to Control Grid and open **Runtime Monitoring**, then **Incidents**.

Say: “The governance console now shows both events: the approved interaction and the blocked attempt. Operations can trace what happened, why the policy decided it, which system and case were involved, and what needs follow-up.”

Point out the matching correlation trail, decision status, and incident created by the blocked request.

### 4:30-5:00 — Close with value

Say: “AI Control Grid turns governance from a spreadsheet exercise into an operating control. Teams can adopt AI quickly, enforce policy at runtime, and give executives, risk owners, and auditors one defensible evidence trail.”

Close on three outcomes: **faster adoption, enforced safeguards, audit-ready evidence**.

## Fallback plan

- If the page becomes stale, reload `http://127.0.0.1:18080/control-grid`.
- If the demo state is unexpected, stop and rerun `npm run demo:pitch`; deterministic offline mode restores the starting dataset.
- If a live interaction cannot be shown, use the seeded dashboard, registry, runtime event, and incident records to narrate the same safe-versus-blocked flow.
- If time is shortened, show only the Northstar workspace, run the blocked PII prompt, and finish on the resulting incident.
- Do not switch to production data, external AI services, or real personal information as a fallback.
