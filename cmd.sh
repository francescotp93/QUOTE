echo "=== keep-alive ancora in pausa? riallungo ==="
curl -s -m 10 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "=== ANIA lookup GY263BY ==="
curl -s -m 90 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
a=d.get('ania') or {}
print('trovato',d.get('trovato'))
for k in ['contraente','codice_fiscale','partita_iva','is_azienda','impresa_attuale','classe_cu','classe_assegnazione_cu','classe_provenienza','tipo_veicolo','scadenza_copertura']:
  if k in a: print(' ',k,'=',a.get(k))
" 2>/dev/null || echo "(parse fail)"
