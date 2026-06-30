echo "=== HDI tunnel attivo? ==="
systemctl is-active hdi-tunnel 2>/dev/null
curl -s --max-time 8 http://127.0.0.1:4401/status 2>/dev/null | head -c 160; echo
echo "=== TEST 1: HDI moto RINNOVO FA85248 (nascita 17/07/1993) ==="
T0=$(date +%s); R=$(curl -s --max-time 175 "http://127.0.0.1:4401/premio?targa=FA85248&nascita=17/07/1993" 2>/dev/null); T1=$(date +%s)
echo "tempo $((T1-T0))s"; echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'),'premio:',d.get('premio'),'err:',(d.get('error') or '')[:150])" 2>&1 | head -3
echo "=== TEST 2: HDI moto VOLTURA BT30750 (report, nascita 11/08/1971) ==="
T0=$(date +%s); R=$(curl -s --max-time 175 "http://127.0.0.1:4401/premio?targa=BT30750&nascita=11/08/1971" 2>/dev/null); T1=$(date +%s)
echo "tempo $((T1-T0))s"; echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'),'premio:',d.get('premio'),'err:',(d.get('error') or '')[:150])" 2>&1 | head -3
