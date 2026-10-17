import json
from pathlib import Path
import subprocess
import sys
import textwrap
import unittest


class RedirectMutationTests(unittest.TestCase):
    def check_mutation(self, mutation, method, expected_failures):
        # Run only the positive contract fixture in a fresh interpreter. Mutations
        # are in memory; no production file or process-global opener is changed.
        root = Path(__file__).resolve().parents[3]
        script = """
import inspect, json, sys, textwrap, unittest
from unittest.mock import patch
from urllib import request
sys.path.insert(0, 'packages/telemetry-sdk-python/tests')
from test_redirects import TelemetryRedirectTests
from ai_control_grid_telemetry import client
MUTATION
suite = unittest.TestSuite([TelemetryRedirectTests(METHOD)])
result = unittest.TestResult()
suite.run(result)
print(json.dumps({'run': result.testsRun, 'failures': len(result.failures),
                  'errors': len(result.errors), 'skipped': len(result.skipped)}))
""".replace("MUTATION", textwrap.dedent(mutation)).replace("METHOD", repr(method))
        completed = subprocess.run([sys.executable, "-B", "-c", textwrap.dedent(script)],
                                   cwd=root, capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout), {
            "run": 1, "failures": expected_failures, "errors": 0, "skipped": 0,
        })

    def test_restoring_urllib_redirects_is_rejected(self):
        self.check_mutation("""
client._RejectTelemetryRedirects.redirect_request = request.HTTPRedirectHandler.redirect_request
""", "test_native_redirects_never_reach_same_or_cross_origin_targets", 12)

    def test_accepting_redirect_status_from_custom_transport_is_rejected(self):
        self.check_mutation("""
source = textwrap.dedent(inspect.getsource(client.AiControlGridTelemetryClient._post))
fixed = 'if not 200 <= status_code < 300:'
assert fixed in source, 'status mutation must match the fixed contract'
namespace = dict(vars(client))
exec(source.replace(fixed, 'if status_code >= 400:'), namespace)
client.AiControlGridTelemetryClient._post = namespace['_post']
""", "test_custom_transports_cannot_report_redirect_status_as_success", 10)
