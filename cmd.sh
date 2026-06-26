cd /opt/withus-backend
echo "=== config HDI nel Pannello Fonti (solo dati non sensibili) ==="
python3 - <<'PY'
import json
try: s=json.load(open('server/fonti.store.json'))
except Exception as e: print('store err:',e); s={}
cs=s.get('__custom') or {}
for k,v in cs.items():
  print("FONTE id=",k,"| nome=",v.get('nome'),"| url=",v.get('url'),"| ruolo=",v.get('ruolo'),"| has2fa=",v.get('has2fa'),"| user?",bool(v.get('username')),"| scraper_url=",v.get('scraper_url'),"scraper_port=",v.get('scraper_port'))
if not cs: print("(nessun portale custom in store)")
PY
echo
echo "=== attendo deploy 02135cb + restart moto-scraper ==="
for i in $(seq 1 24); do h=$(git rev-parse --short HEAD); [ "$h" = "02135cb" ] && break; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 25); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "moto up giro $i"; break; }; sleep 4; done
sleep 4
echo "=== /allest FA85248 (come si seleziona l'allestimento) ==="
curl -s -m 120 "$B/allest?targa=FA85248&nascita=19/05/1995" | head -c 2200
