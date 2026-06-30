echo "=== FAST CF: recupera_situazione_assicurativa(targa) contiene il proprietario? ==="
R=$(curl -s --max-time 60 "http://127.0.0.1:4300/api?action=recupera_situazione_assicurativa&targa=GY263BY" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); sys.exit()
risp=d.get('risposta') or {}
data=risp.get('data') if isinstance(risp,dict) else None
print('risposta keys:', list(risp.keys()) if isinstance(risp,dict) else type(risp).__name__)
if isinstance(data,dict): print('data keys:', list(data.keys()))
print('full (2000c):', json.dumps(risp,ensure_ascii=False)[:2000])
" 2>&1 | head -40
