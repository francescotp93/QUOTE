set +e
echo "=== /motor?step=open — apre il Preventivo Motor e dumpa finestre/iframe ==="
timeout 130 curl -s --max-time 125 "http://127.0.0.1:4200/motor?step=open&wait=22000&sniff=1" > /tmp/alzmotor.json 2>&1
echo "dim: $(wc -c < /tmp/alzmotor.json) byte"
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/alzmotor.json'))
except Exception as e:
    print('NON-JSON:', open('/tmp/alzmotor.json').read()[:1500]); raise SystemExit
def short(x,n=2000):
    s=json.dumps(x,ensure_ascii=False)
    return s[:n]
# stampa struttura ad alto livello
print('top keys:', list(d.keys()) if isinstance(d,dict) else type(d))
if isinstance(d,dict):
    for k in ('error','step','fastFrame','fast','frames','pagine','pages','probe','azioni','url'):
        if k in d: print('\n['+k+'] ', short(d[k], 1800))
PY
echo "---fine---"
