cd /opt/withus-backend
for i in $(seq 1 30); do h=$(git rev-parse --short HEAD 2>/dev/null); [ "$h" = "b1c56cc" ] && { echo "deploy b1c56cc giro $i"; break; }; sleep 5; done
B=http://127.0.0.1:4300
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 3; done
sleep 3
CF=LMBNGL95E19D423D
IND=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("STRADA LEONARDO PIZZARDI 62 91031 MISILISCEMI TP"))')
SIT=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("Voltura al PRA"))')
echo "=== /premio moto FA85248 Voltura + anagrafica Lombardo ==="
curl -s -m 230 "$B/premio?targa=FA85248&situazione=$SIT&cf=$CF&indirizzo=$IND" > /tmp/pr.json
python3 - <<'PY'
import json
try: d=json.load(open('/tmp/pr.json'))
except Exception as e: print('ERR',e,open('/tmp/pr.json').read()[:200]); raise SystemExit
p=d.get('premio') or {}
print('ok:',d.get('ok'),'ANNUALE:',p.get('premio_annuale'),'tariffa:',p.get('tariffa'),'prodotto:',p.get('prodotto'))
print('garanzie:',[(g.get('nome'),g.get('premio')) for g in (p.get('garanzie') or [])])
print('LOG:')
for x in (d.get('log') or []): print('  ',x)
PY
