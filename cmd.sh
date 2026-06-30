echo "=== RINNOVO GY263BY: proprietario/contraente recuperati? ==="
R=$(curl -s --max-time 120 "http://127.0.0.1:4300/hubveicolo?targa=GY263BY&situazione=Rinnovo" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); print(sys.stdin.read()[:300]); sys.exit()
print('ok:',d.get('ok'),'err:',d.get('error'))
print('--- proprietario:', json.dumps(d.get('proprietario'),ensure_ascii=False)[:600])
print('--- contraente:', json.dumps(d.get('contraente'),ensure_ascii=False)[:600])
v=d.get('veicolo') or {}
print('--- veicolo:', v.get('marca'),v.get('modello'),'| dataKeys:', d.get('dataKeys'))
" 2>&1 | head -30
