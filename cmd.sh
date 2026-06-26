B=http://127.0.0.1:4300
for i in $(seq 1 20); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && break; sleep 3; done
echo "=== /hub?targa=FA85248 (anagrafica + situazione + veicolo) ==="
curl -s -m 90 "$B/hub?targa=FA85248" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(json.dumps(d, ensure_ascii=False)[:900])
' 2>/dev/null
echo; echo "=== /hubveicolo?targa=FA85248 (modello) ==="
curl -s -m 90 "$B/hubveicolo?targa=FA85248" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(json.dumps(d, ensure_ascii=False)[:700])
' 2>/dev/null
