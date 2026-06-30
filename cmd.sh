systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 20); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "data_ultima_voltura per ID" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
echo "=== Voltura GY263BY (data voltura per id) ==="
T0=$(date +%s)
R=$(curl -s --max-time 175 "http://127.0.0.1:4300/premio?targa=GY263BY&situazione=Voltura%20al%20PRA&cf=DDOFNC93L17D423L&indirizzo=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("CONTRADA CASAZZE 142 91025 MARSALA TP"))')" 2>/dev/null)
T1=$(date +%s)
echo "tempo $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
p=d.get('premio') or {}
print('>>> ok:',d.get('ok'),'| PREMIO:',p.get('premio_annuale'),'| prodotto:',p.get('prodotto'),'| step:',d.get('step'))
print('campi vuoti:', [(c.get('id') or c.get('name')) for c in (d.get('campiVuoti') or [])][:8])
for l in (d.get('log') or []):
    s=str(l)
    if any(k in s.lower() for k in ('voltura','obbligat','step:')): print('  ',s[:120])
" 2>&1 | head -22
