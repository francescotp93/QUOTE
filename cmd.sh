echo "=== VOLTURA GY263BY: esito finale (avviso/errore_portale) ==="
R=$(curl -s --max-time 210 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
printf '%s' "$R" | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception as e: print('NON JSON',e); sys.exit()
p=d.get('premio') or {}
print('ok:',d.get('ok'))
print('avviso:',d.get('avviso'))
print('errore_portale:',d.get('errore_portale'))
print('premio_annuale:',p.get('premio_annuale'),'prodotto:',p.get('prodotto'),'result:',p.get('result'))
print('step:',d.get('step'))
" 2>&1 | head -20
