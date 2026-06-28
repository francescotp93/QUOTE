echo "=== clic ERRORI E SEGNALAZIONI (dettaglio fattori mancanti) ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore?click=ERRORI%20E%20SEGNALAZIONI" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('TEXT:',d.get('text','')[:700])
print('--- BTN ---',[l['t'] for l in d.get('links',[]) if l['t'] and l['t'] not in ('0','N.A.','N.D.','CRM','DANNI','VITA','VITA PROTECTION','INCASSI','SINISTRI','INCENTIX')][:30])"
