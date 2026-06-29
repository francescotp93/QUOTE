echo "=== Groupama ISA: moto rinnovo FA85248 (HONDA SH 350) ==="
T0=$(date +%s); R=$(curl -s --max-time 120 "http://127.0.0.1:4500/premio?targa=FA85248" 2>/dev/null); T1=$(date +%s)
echo "tempo: $((T1-T0))s"
echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'),'| premio:',d.get('premio_annuale'),'| prodotto:',d.get('prodotto'),'| marca:',d.get('marca'),'| modello:',d.get('modello'),'| err:',(d.get('error') or '')[:160])" 2>&1 | head -5
