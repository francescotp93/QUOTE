set -e
B=http://127.0.0.1:4300
echo "=== applicaScontoAuto (function body) ==="
curl -s "$B/jsgrep?q=applicaScontoAuto&before=120&after=900" | python3 -c 'import sys,json;d=json.load(sys.stdin);[print("FILE:",h.get("file","?"),"\n",h.get("snippet",h)) for f in (d if isinstance(d,list) else d.get("hits",d.get("results",[]))) for h in ([f] if isinstance(f,dict) else [])]' 2>/dev/null || curl -s "$B/jsgrep?q=applicaScontoAuto&before=120&after=900"
echo; echo "=== button_sconto / slider init ==="
curl -s "$B/jsgrep?q=button_sconto&before=200&after=400"
