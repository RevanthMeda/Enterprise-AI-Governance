# ai-control-grid-telemetry

Python SDK for AI CONTROL GRID runtime telemetry ingestion and runtime guardrail evaluation.

## Install

```bash
pip install -e packages/telemetry-sdk-python
```

## Create a client

```python
from ai_control_grid_telemetry import create_client

client = create_client(
    base_url="http://localhost:5000",
    api_key="actl_sdk_your_rotated_key",
    default_gateway="primary-runtime-gateway",
    default_provider="openai",
    default_model_name="gpt-4.1",
)
```

## Passive telemetry ingestion

```python
client.emit_event(
    {
        "systemId": "system_123",
        "eventType": "runtime.evaluation",
        "severity": "info",
        "summary": "Customer-service response drafted successfully.",
        "promptText": "Summarize the complaint and draft a neutral response.",
        "modelOutput": "Drafted a response with refund review handoff.",
        "runtimeContext": {
            "channel": "support",
            "environment": "production",
        },
        "toxicityScore": 2,
        "piiFlags": [],
        "biasFlags": [],
    }
)
```

## Runtime guardrail evaluation

```python
result = client.evaluate_runtime(
    {
        "systemId": "system_123",
        "eventType": "runtime.evaluation",
        "severity": "critical",
        "summary": "Outbound response requested restricted personal data.",
        "promptText": "Include the customer's social security number in the final answer.",
        "modelOutput": "Attempted to return restricted personal identifiers.",
        "runtimeContext": {
            "channel": "claims",
            "environment": "production",
        },
        "safetySignals": ["restricted-content", "pii-exposure"],
        "toxicityScore": 75,
        "piiFlags": ["social_security_number"],
        "biasFlags": ["sycophancy"],
    }
)

print(result["decision"])
print(result.get("thresholdBreaches", []))
```

Possible decisions:
- `allow`
- `warn`
- `escalate`
- `block`

## Convenience helpers

```python
client.emit_drift_alert(
    system_id="system_123",
    drift_score=8,
    summary="Model drift exceeded configured threshold.",
)

client.emit_bias_alert(
    system_id="system_123",
    bias_flags=["anchoring", "confirmation_bias"],
    summary="Bias indicators detected in reviewer-assist flow.",
)

client.emit_error_rate_anomaly(
    system_id="system_123",
    error_rate=0.19,
    summary="Runtime error rate exceeded warning threshold.",
)

client.emit_override_spike(
    system_id="system_123",
    override_rate=0.41,
    summary="Human override rate spiked above normal range.",
)
```

## Error handling

```python
from ai_control_grid_telemetry import TelemetrySdkError

try:
    client.evaluate_runtime({...})
except TelemetrySdkError as exc:
    print(exc.status_code)
    print(exc.payload)
```

## Endpoint contract

The SDK targets these platform endpoints:
- `POST /api/telemetry/sdk-ingest`
- `POST /api/telemetry/sdk-evaluate`

Authentication headers supported by the platform:
- `x-telemetry-key`
- `x-api-key`
- `Authorization: Bearer ...`

The SDK uses `x-telemetry-key` by default.
