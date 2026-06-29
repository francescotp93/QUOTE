echo "=== logindump completo (chiavi reali: ctrls/text/title) ==="
curl -s --max-time 30 "http://127.0.0.1:4200/logindump" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url  :', (d.get('url') or '')[:120])
print('title:', d.get('title'))
print('text(400):', (d.get('text') or '')[:400].replace(chr(10),' | '))
ctrls=d.get('ctrls') or []
print('n_ctrls:', len(ctrls))
for c in ctrls[:30]: print('  ', c)
"
echo "=== quanti frame ha la pagina? ==="
curl -s --max-time 20 "http://127.0.0.1:4200/shot" 2>/dev/null | head -c 200
