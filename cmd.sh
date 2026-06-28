echo "=== click Quotazione ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore?click=Quotazione&all=1" 2>&1 > /tmp/q.json
grep -iE "\"url\"|\"title\"" /tmp/q.json | head -2
grep "\"text\"" /tmp/q.json | head -1 | cut -c1-500
echo "--- campi ---"; grep -iE "\"name\":|\"placeholder\":|targa|\"id\":" /tmp/q.json | head -15
echo "--- voci (motor/auto/emissione) ---"; grep -oiE "\"t\": \"[^\"]*\"" /tmp/q.json | grep -iE "motor|auto|emiss|veicol|rca|nuov" | head -15
