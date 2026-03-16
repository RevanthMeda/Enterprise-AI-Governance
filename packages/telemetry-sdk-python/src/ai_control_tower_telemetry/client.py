from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping
from urllib import error, request

JsonDict = dict[str, Any]
JsonMapping = Mapping[str, Any]
HttpPost = Callable[[str, bytes, Mapping[str, str], float], tuple[int, JsonDict]]


class TelemetrySdkError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, payload: JsonDict | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


@dataclass(slots=True)
class TelemetryClientConfig:
    base_url: str
    api_key: str
    header_name: str = "x-telemetry-key"
    timeout: float = 15.0
    default_gateway: str | None = None
    default_provider: str | None = None
    default_model_name: str | None = None
    post_func: HttpPost | None = None


@dataclass(slots=True)
class AiControlTowerTelemetryClient:
    config: TelemetryClientConfig

    def emit_event(self, payload: JsonMapping) -> JsonDict:
        return self._post("/api/telemetry/sdk-ingest", payload)

    def evaluate_runtime(self, payload: JsonMapping) -> JsonDict:
        return self._post("/api/telemetry/sdk-evaluate", payload)

    def emit_drift_alert(
        self,
        *,
        system_id: str | None,
        drift_score: int,
        summary: str,
        severity: str = "warning",
        metadata: JsonMapping | None = None,
    ) -> JsonDict:
        return self.emit_event(
            {
                "systemId": system_id,
                "eventType": "model_drift",
                "severity": severity,
                "driftScore": drift_score,
                "summary": summary,
                "metadata": dict(metadata or {}),
            }
        )

    def emit_bias_alert(
        self,
        *,
        system_id: str | None,
        bias_flags: list[str],
        summary: str,
        severity: str = "warning",
        metadata: JsonMapping | None = None,
    ) -> JsonDict:
        return self.emit_event(
            {
                "systemId": system_id,
                "eventType": "bias_detection",
                "severity": severity,
                "biasFlags": bias_flags,
                "summary": summary,
                "metadata": dict(metadata or {}),
            }
        )

    def emit_error_rate_anomaly(
        self,
        *,
        system_id: str | None,
        error_rate: float,
        summary: str,
        severity: str = "warning",
        metadata: JsonMapping | None = None,
    ) -> JsonDict:
        payload = dict(metadata or {})
        payload["errorRate"] = error_rate
        return self.emit_event(
            {
                "systemId": system_id,
                "eventType": "error_rate_anomaly",
                "severity": severity,
                "summary": summary,
                "metadata": payload,
            }
        )

    def emit_override_spike(
        self,
        *,
        system_id: str | None,
        override_rate: float,
        summary: str,
        severity: str = "warning",
        metadata: JsonMapping | None = None,
    ) -> JsonDict:
        payload = dict(metadata or {})
        payload["overrideRate"] = override_rate
        return self.emit_event(
            {
                "systemId": system_id,
                "eventType": "override_rate_spike",
                "severity": severity,
                "summary": summary,
                "metadata": payload,
            }
        )

    def _post(self, path: str, payload: JsonMapping) -> JsonDict:
        enriched_payload = self._with_defaults(payload)
        body = json.dumps(enriched_payload).encode("utf-8")
        headers = {
            self.config.header_name: self.config.api_key,
            "Content-Type": "application/json",
        }

        post_func = self.config.post_func or _default_post
        status_code, parsed_payload = post_func(
            f"{self.config.base_url.rstrip('/')}{path}",
            body,
            headers,
            self.config.timeout,
        )

        if status_code >= 400:
            raise TelemetrySdkError(
                parsed_payload.get("message", "AI Control Tower telemetry request failed."),
                status_code=status_code,
                payload=parsed_payload,
            )

        return parsed_payload

    def _with_defaults(self, payload: JsonMapping) -> JsonDict:
        enriched = dict(payload)
        if self.config.default_gateway and "gateway" not in enriched:
            enriched["gateway"] = self.config.default_gateway
        if self.config.default_provider and "provider" not in enriched:
            enriched["provider"] = self.config.default_provider
        if self.config.default_model_name and "modelName" not in enriched:
            enriched["modelName"] = self.config.default_model_name
        return enriched


def create_client(
    *,
    base_url: str,
    api_key: str,
    header_name: str = "x-telemetry-key",
    timeout: float = 15.0,
    default_gateway: str | None = None,
    default_provider: str | None = None,
    default_model_name: str | None = None,
    post_func: HttpPost | None = None,
) -> AiControlTowerTelemetryClient:
    return AiControlTowerTelemetryClient(
        TelemetryClientConfig(
            base_url=base_url,
            api_key=api_key,
            header_name=header_name,
            timeout=timeout,
            default_gateway=default_gateway,
            default_provider=default_provider,
            default_model_name=default_model_name,
            post_func=post_func,
        )
    )


def _default_post(url: str, body: bytes, headers: Mapping[str, str], timeout: float) -> tuple[int, JsonDict]:
    req = request.Request(url, data=body, headers=dict(headers), method="POST")
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return response.status, _parse_json(raw)
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, _parse_json(raw)
    except error.URLError as exc:
        raise TelemetrySdkError(f"Unable to reach AI Control Tower endpoint: {exc.reason}") from exc


def _parse_json(raw: str) -> JsonDict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        return {"data": parsed}
    except json.JSONDecodeError:
        return {"message": raw}
