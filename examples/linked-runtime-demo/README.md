# Linked runtime demo app

This is a minimal external application that uses the shipped Node telemetry SDK.

It demonstrates the real automation path:

1. a user interacts with the external app
2. the app sends the prompt to AI Control Tower for preflight evaluation
3. if allowed, the app executes the model call and sends the output to AI Control Tower for postflight evaluation
4. AI Control Tower automatically evaluates policy, records telemetry, updates incidents, updates reassessment history, and writes audit logs
4. the reporting pages refresh on their own

## Required environment variables

```env
AICT_BASE_URL=https://YOUR_DEPLOYED_CONTROL_TOWER_HOST
AICT_TELEMETRY_KEY=YOUR_ROTATED_TELEMETRY_KEY
```

Optional:

```env
AICT_SYSTEM_ID=YOUR_SYSTEM_ID
AICT_GATEWAY=linked-demo-gateway
AICT_PROVIDER=openai
AICT_MODEL_NAME=gpt-4.1
LINKED_RUNTIME_DEMO_PORT=18080
```

If the telemetry adapter is bound to a default AI system, `AICT_SYSTEM_ID` can be omitted and the backend will map events to the bound system automatically.

## Run

From the repo root:

```bash
npm run demo:linked-runtime-app
```

Then open:

```text
http://localhost:18080
```

## Scenarios

- `Run allow flow`
- `Run warn flow`
- `Run block flow`

## What to watch in AI Control Tower

Open these pages in the deployed app:

- `/runtime-monitoring`
- `/incidents`
- `/risk`
- `/audit`
- `/decision-trace`

Then trigger scenarios from the demo app and confirm those pages update automatically.

## API usage

You can also call the demo app directly:

```bash
curl -X POST http://localhost:18080/simulate/allow
curl -X POST http://localhost:18080/simulate/warn
curl -X POST http://localhost:18080/simulate/block
```
