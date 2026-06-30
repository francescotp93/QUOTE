echo "=== ALLIANZ ANIA: ricerca GY263BY (frame-aware, attesa async) ==="
for i in $(seq 1 24); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4200/status" 2>/dev/null)
  echo "$S" | grep -q '"loggato":true' && { echo "scraper pronto"; break; }
  sleep 5
done
sleep 4
R=$(curl -s --max-time 90 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON / err:',e); print(sys.stdin.read()[:400]); sys.exit()
print('ok:',d.get('ok'),'| submit:',d.get('submit'),'| popup:',d.get('popup'),'| nframes:',d.get('nframes'),'| err:',d.get('error'))
ris=d.get('risultato') or {}
print('url:',ris.get('url'))
print('=== TESTO ===')
print((ris.get('text') or '(vuoto)')[:3500])
print('=== TABELLE ===')
for t in (ris.get('tables') or []): print('  •',t[:400])
" 2>&1 | head -90
