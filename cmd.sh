echo "=== 24H scraper status ==="
curl -s --max-time 8 http://127.0.0.1:4100/status 2>/dev/null | head -c 160; echo
echo "=== 24H /quote moto RINNOVO FA85248 (HONDA SH 350) ==="
T0=$(date +%s); R=$(curl -s --max-time 230 "http://127.0.0.1:4100/quote?targa=FA85248&nascita=17/07/1993&cf=DDOFNC93L17D423L&comune=Marsala" 2>/dev/null); T1=$(date +%s)
echo "tempo $((T1-T0))s"
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    if k=='log': continue
    print(f'{k}: {str(v)[:180]}')
print('--- LOG ---')
for l in (d.get('log') or [])[-15:]: print('  ',str(l)[:150])
" 2>&1 | head -40
