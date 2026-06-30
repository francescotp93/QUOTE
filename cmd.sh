echo "=== PRIMA: stato + tentativo login + cosa mostra la pagina ==="
echo "--- /status PRIMA del login:"
curl -s --max-time 10 "http://127.0.0.1:4600/status" 2>/dev/null | head -c 400; echo
echo "--- avvio login (/login):"
curl -s --max-time 90 "http://127.0.0.1:4600/login" 2>/dev/null | head -c 300; echo
sleep 25
echo "--- /loginstate:"
curl -s --max-time 10 "http://127.0.0.1:4600/loginstate" 2>/dev/null | head -c 300; echo
echo "--- /logindump (cosa c'è in pagina):"
curl -s --max-time 20 "http://127.0.0.1:4600/logindump" 2>/dev/null | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except: print(sys.stdin.read()[:300]); sys.exit()
print('url:',d.get('url'))
print('title:',d.get('title'))
print('TEXT:',(d.get('text') or '')[:400])
print('campi:',[ (c.get('type'),c.get('name') or c.get('id') or c.get('placeholder')) for c in (d.get('ctrls') or []) ][:12])
" 2>&1 | head -30
