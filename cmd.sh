echo "=== ANIA parser arricchito + testo completo ==="
for i in $(seq 1 24); do S=$(curl -s --max-time 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo "pronto"; break; }; sleep 5; done
sleep 5
R=$(curl -s --max-time 95 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON / err:',e); print(sys.stdin.read()[:300]); sys.exit()
a=d.get('ania') or {}
print('trovato:',d.get('trovato'))
for k in ['classe_provenienza','classe_cu','classe_assegnazione','classe_assegnazione_cu','scadenza_copertura','decorrenza_copertura','impresa_attuale']:
  print(f'  {k}: {a.get(k)}')
print('=== TESTO COMPLETO (per trovare scadenza) ===')
print(((d.get('risultato') or {}).get('text') or '')[:4500])
" 2>&1 | head -90
