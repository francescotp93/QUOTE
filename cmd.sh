echo "=== click Individuale -> cerco EMISSIONE/MOTOR/AUTO ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore?click=Individuale&all=1" 2>&1 > /tmp/i.json
grep "\"text\"" /tmp/i.json | head -1 | cut -c1-500
echo "--- voci (cerco emissione/motor/auto) ---"
grep -oiE "\"t\": \"[^\"]*\"" /tmp/i.json | grep -iE "emiss|motor|auto|nuova|preventiv|veicol|individ" | head -20
echo "--- tutte le voci ---"
grep -oE "\"t\": \"[^\"]*\"" /tmp/i.json | head -35
