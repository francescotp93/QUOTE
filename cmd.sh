B=http://127.0.0.1:4100
echo "=== 24H /status ==="
curl -s -m 10 "$B/status"; echo
echo "=== 24H /quote FA85248 nascita 19/05/1995 ==="
curl -s -m 150 "$B/quote?targa=FA85248&nascita=19/05/1995" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(json.dumps(d, ensure_ascii=False)[:600])
' 2>/dev/null || echo "(errore/timeout)"
