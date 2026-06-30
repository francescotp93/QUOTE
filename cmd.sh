echo "=== ALLIANZ ANIA: ricerca GY263BY (bottone corretto) ==="
# attendo che lo scraper sia su e loggato (post-deploy)
for i in $(seq 1 20); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4200/status" 2>/dev/null)
  echo "$S" | grep -q '"loggato":true' && { echo "scraper pronto"; break; }
  sleep 5
done
R=$(curl -s --max-time 70 "http://127.0.0.1:4200/lookup?targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON / err:',e); print(sys.stdin.read()[:400]); sys.exit()
print('ok:',d.get('ok'),'submit:',d.get('campo_targa_compilato'),'err:',d.get('error'))
dump=d.get('_dump') or {}
print('url:',dump.get('url'))
print('=== TESTO RISULTATO ===')
print(dump.get('text') or '(vuoto)')
" 2>&1 | head -70
