echo "=== dump pagina MFA Allianz (campi/bottoni/testo) ==="
curl -s --max-time 30 "http://127.0.0.1:4200/logindump" 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print('url:', d.get('url'))
    print('--- campi input ---')
    for f in (d.get('campi') or d.get('inputs') or d.get('fields') or [])[:25]:
        print('  ', {k:f.get(k) for k in ('name','id','type','placeholder','value','aria') if f.get(k)})
    print('--- bottoni/link ---')
    for b in (d.get('bottoni') or d.get('buttons') or [])[:25]:
        print('  ', b if isinstance(b,str) else {k:b.get(k) for k in ('t','text','id','onclick') if b.get(k)})
    t=d.get('testo') or d.get('text') or ''
    print('--- testo pagina (300) ---'); print(' ', t[:300].replace(chr(10),' '))
except Exception as e:
    print('parse err:', e); print(sys.stdin.read()[:1200])
"
