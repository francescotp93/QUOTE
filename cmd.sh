echo "=== Groupama ISA: provo la targa MOTO ES23789 (regge la moto?) ==="
T0=$(date +%s)
R=$(curl -s --max-time 120 "http://127.0.0.1:4500/premio?targa=ES23789" 2>/dev/null)
T1=$(date +%s)
echo "tempo: $((T1-T0))s"
echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'),'| premio:',d.get('premio_annuale'),'| prodotto:',d.get('prodotto'),'| marca:',d.get('marca'),'| err:',(d.get('error') or '')[:160])" 2>&1 | head -5
