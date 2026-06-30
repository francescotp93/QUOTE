systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 20); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "Data ultima voltura" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
echo "=== Voltura GY263BY con indirizzo completo (ora con data voltura) ==="
T0=$(date +%s)
R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
T1=$(date +%s)
echo "tempo $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=d.get('premio') or {}
print('ok:',d.get('ok'),'| premio:',p.get('premio_annuale'),'| step:',d.get('step'))
print('campi VUOTI allo step bloccato:')
for c in (d.get('campiVuoti') or [])[:15]: print('  ', c.get('tag'),'| id:',c.get('id'),'| name:',c.get('name'),'| lbl:',c.get('lbl'))
print('log voltura:')
for l in (d.get('log') or []):
    s=str(l)
    if any(k in s.lower() for k in ('voltura','anagra','step','obbligat','allestim')): print('  ',s[:130])
" 2>&1 | head -30
