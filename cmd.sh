echo "=== click Trattativa ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Trattativa&all=1" 2>&1 > /tmp/t.json
grep -iE "\"text\"" /tmp/t.json | head -1
echo "--- link/voci (cerco Nuovo preventivo auto) ---"
grep -iE "\"t\":|nuovo|preventiv|auto|moto|autocarr" /tmp/t.json | head -30
echo "=== se serve, click Nuovo preventivo auto ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Nuovo%20preventivo%20auto&all=1" 2>&1 > /tmp/np.json
grep -iE "\"text\"" /tmp/np.json | head -1
echo "--- campi (cerco TARGA) ---"
grep -iE "targa|\"placeholder\":|\"name\":|\"id\":" /tmp/np.json | head -25
