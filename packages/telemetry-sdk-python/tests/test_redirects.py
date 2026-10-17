import json
import secrets
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ai_control_grid_telemetry import TelemetrySdkError, create_client


class LoopbackEndpoints:
    def __init__(self):
        self.status = 201
        self.location = None
        self.payload = {"accepted": True, "source": "synthetic-loopback"}
        self.header_name = "x-telemetry-key"
        self.key = secrets.token_urlsafe(32)
        self.source_requests = []
        self.target_requests = []
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def handle_request(self):
                raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                record = {
                    "method": self.command,
                    "path": self.path,
                    "credential_received": self.headers.get(fixture.header_name) == fixture.key,
                    "body": json.loads(raw) if raw else None,
                }
                if self.server is fixture.source and self.path.startswith("/api/telemetry/"):
                    fixture.source_requests.append(record)
                    status, payload = fixture.status, fixture.payload
                else:
                    fixture.target_requests.append(record)
                    status, payload = 200, {"accepted": True}
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Connection", "close")
                if fixture.location and status == fixture.status:
                    self.send_header("Location", fixture.location)
                self.end_headers()
                self.wfile.write(body)

            do_POST = handle_request
            do_GET = handle_request

            def log_message(self, *_args):
                pass

        self.source = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.target = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.threads = []

    @property
    def source_url(self):
        return f"http://127.0.0.1:{self.source.server_port}"

    @property
    def target_url(self):
        return f"http://127.0.0.1:{self.target.server_port}"

    def __enter__(self):
        for server in (self.source, self.target):
            thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
            thread.start()
            self.threads.append(thread)
        return self

    def __exit__(self, *_args):
        for server in (self.source, self.target):
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join()

    def client(self):
        return create_client(base_url=self.source_url, api_key=self.key,
                             header_name=self.header_name, timeout=2)


class TelemetryRedirectTests(unittest.TestCase):
    methods = ("emit_event", "evaluate_runtime")

    def test_native_redirects_never_reach_same_or_cross_origin_targets(self):
        with LoopbackEndpoints() as fixture:
            for method in self.methods:
                for status in (301, 302, 303, 307, 308):
                    for cross_origin in (False, True):
                        with self.subTest(method=method, status=status, cross_origin=cross_origin):
                            fixture.source_requests.clear()
                            fixture.target_requests.clear()
                            fixture.status = status
                            fixture.location = f"{fixture.target_url}/capture" if cross_origin else "/capture"
                            with self.assertRaises(TelemetrySdkError) as caught:
                                getattr(fixture.client(), method)({"summary": "synthetic event"})
                            self.assertEqual(caught.exception.status_code, status)
                            self.assertEqual(len(fixture.source_requests), 1)
                            self.assertTrue(fixture.source_requests[0]["credential_received"])
                            self.assertEqual(len(fixture.target_requests), 0)

    def test_custom_and_authorization_headers_are_not_forwarded(self):
        with LoopbackEndpoints() as fixture:
            fixture.status = 302
            fixture.location = f"{fixture.target_url}/capture"
            for header in ("x-custom-telemetry-key", "Authorization"):
                fixture.header_name = header
                fixture.key = ("Bearer " if header == "Authorization" else "") + secrets.token_urlsafe(32)
                for method in self.methods:
                    with self.subTest(header=header, method=method):
                        fixture.target_requests.clear()
                        with self.assertRaises(TelemetrySdkError):
                            getattr(fixture.client(), method)({"summary": "synthetic event"})
                        self.assertEqual(len(fixture.target_requests), 0)

    def test_direct_requests_preserve_credentials_body_endpoints_and_result(self):
        with LoopbackEndpoints() as fixture:
            client = create_client(base_url=fixture.source_url, api_key=fixture.key,
                                   default_gateway="synthetic-gateway", timeout=2)
            for method, endpoint in (("emit_event", "sdk-ingest"), ("evaluate_runtime", "sdk-evaluate")):
                with self.subTest(method=method):
                    result = getattr(client, method)({"summary": "synthetic event"})
                    self.assertEqual(result, fixture.payload)
                    self.assertEqual(fixture.source_requests[-1], {
                        "method": "POST", "path": f"/api/telemetry/{endpoint}",
                        "credential_received": True,
                        "body": {"summary": "synthetic event", "gateway": "synthetic-gateway"},
                    })
            self.assertEqual(len(fixture.target_requests), 0)

    def test_existing_http_error_status_and_payload_are_preserved(self):
        with LoopbackEndpoints() as fixture:
            fixture.payload = {"message": "synthetic denial", "reason": "synthetic"}
            for method in self.methods:
                for status in (400, 401, 403, 500):
                    with self.subTest(method=method, status=status):
                        fixture.status = status
                        with self.assertRaises(TelemetrySdkError) as caught:
                            getattr(fixture.client(), method)({"summary": "synthetic event"})
                        self.assertEqual(caught.exception.status_code, status)
                        self.assertEqual(caught.exception.payload, fixture.payload)
                        self.assertEqual(str(caught.exception), "synthetic denial")

    def test_custom_transports_cannot_report_redirect_status_as_success(self):
        payload = {"message": "synthetic redirect"}
        for method in self.methods:
            for status in (301, 302, 303, 307, 308):
                with self.subTest(method=method, status=status):
                    client = create_client(base_url="https://synthetic.invalid", api_key=secrets.token_urlsafe(32),
                                           post_func=lambda *_args: (status, payload))
                    with self.assertRaises(TelemetrySdkError) as caught:
                        getattr(client, method)({"summary": "synthetic event"})
                    self.assertEqual(caught.exception.status_code, status)
                    self.assertEqual(caught.exception.payload, payload)

    def test_custom_transport_success_and_exceptions_keep_existing_behavior(self):
        payload = {"accepted": True, "futureMetadata": {"synthetic": True}}
        failure = RuntimeError("synthetic transport failure")
        def broken(*_args):
            raise failure
        for method in self.methods:
            for status in (200, 201, 202, 204):
                with self.subTest(method=method, status=status):
                    client = create_client(base_url="https://synthetic.invalid", api_key=secrets.token_urlsafe(32),
                                           post_func=lambda *_args: (status, payload))
                    self.assertIs(getattr(client, method)({"summary": "synthetic event"}), payload)
            client = create_client(base_url="https://synthetic.invalid", api_key=secrets.token_urlsafe(32),
                                   post_func=broken)
            with self.assertRaises(RuntimeError) as caught:
                getattr(client, method)({"summary": "synthetic event"})
            self.assertIs(caught.exception, failure)

    def test_private_opener_does_not_replace_process_global_opener(self):
        with LoopbackEndpoints() as fixture:
            original_opener = request._opener
            fixture.client().emit_event({"summary": "synthetic event"})
            self.assertIs(request._opener, original_opener)


if __name__ == "__main__":
    unittest.main()
