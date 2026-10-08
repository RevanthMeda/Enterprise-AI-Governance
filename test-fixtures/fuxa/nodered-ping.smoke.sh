#!/usr/bin/env bash
set -euo pipefail
image=${1:?Docker image required}
fixture_dir=$(mktemp -d)
container_id=
cleanup() {
    if [ -n "$container_id" ]; then docker logs "$container_id"; docker rm -f "$container_id" >/dev/null; fi
    rm -rf "$fixture_dir"
}
trap cleanup EXIT
cat > "$fixture_dir/flows.json" <<'JSON'
[
  {"id":"ping-test","type":"tab","label":"Bounded ping regression"},
  {"id":"request","type":"http in","z":"ping-test","name":"Loopback test","url":"/ping-test","method":"get","upload":false,"swaggerDoc":"","wires":[["ping"]]},
  {"id":"ping","type":"exec","z":"ping-test","command":"ping -n -c 1 -W 2 127.0.0.1","addpay":false,"append":"","useSpawn":"false","timer":"5","winHide":false,"name":"Bounded loopback ping","wires":[["response"],[],[]]},
  {"id":"response","type":"http response","z":"ping-test","name":"ICMP result","statusCode":"200","headers":{},"wires":[]}
]
JSON
cat > "$fixture_dir/settings.js" <<'JS'
module.exports = { flowFile: 'flows.json', uiPort: 1880, uiHost: '0.0.0.0', logging: { console: { level: 'info' } } };
JS
container_id=$(docker run -d -p 127.0.0.1::1880 -v "$fixture_dir:/tmp/ping-fixture" "$image" node node_modules/node-red/red.js --userDir /tmp/ping-fixture --settings /tmp/ping-fixture/settings.js)
port=$(docker port "$container_id" 1880/tcp | cut -d: -f2)
for attempt in {1..30}; do
    if curl --fail --silent "http://127.0.0.1:$port/ping-test" > "$fixture_dir/result.txt"; then break; fi
    sleep 1
done
cat "$fixture_dir/result.txt"
grep -Eq '1 (packets )?received' "$fixture_dir/result.txt"
printf '%s\n' 'PASS: Node-RED built-in exec runs bounded ping in the Docker runtime'
