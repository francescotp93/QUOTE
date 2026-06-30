echo "=== ALLIANZ ANIA: parser strutturato GY263BY ==="
for i in $(seq 1 24); do S=$(curl -s --max-time 8 "http://127.0.0.1:4200/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo "pronto"; break; }; sleep 5; done
sleep 4
R=$(curl -s --max-time 95 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON / err:',e); print(sys.stdin.read()[:400]); sys.exit()
print('ok:',d.get('ok'),'| trovato:',d.get('trovato'))
a=d.get('ania') or {}
for k in ['impresa_attuale','contraente','codice_fiscale','partita_iva','is_azienda','targa','tipo_veicolo','classe_provenienza','classe_cu','polizza','tariffa','scadenza_copertura','decorrenza_copertura','frazionamento']:
  print(f'  {k}: {a.get(k)}')
print('  _campi:', json.dumps(a.get('_campi'),ensure_ascii=False)[:600])
" 2>&1 | head -40
