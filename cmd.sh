echo "=== frame del Quick Quotation + contenuto ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore?all=1" 2>&1 > /tmp/qq.json
echo "--- frames ---"; grep -A12 "\"frames\"" /tmp/qq.json | head -14
echo "--- testo frame contenuto ---"; grep "\"text\"" /tmp/qq.json | head -1 | cut -c1-450
echo "--- campi ---"; grep -iE "\"name\":|\"placeholder\":|targa" /tmp/qq.json | head -12
echo "--- voci (prodotti: auto/motor/autocarro/ciclo) ---"; grep -oiE "\"t\": \"[^\"]*\"" /tmp/qq.json | grep -iE "auto|motor|ciclo|autocarr|veicol|rca|continua|avanti|prosegui" | head -15
