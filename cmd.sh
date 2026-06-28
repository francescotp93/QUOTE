echo "=== tutte le voci cliccabili della home AXA ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore?all=1" 2>&1 > /tmp/m.json
echo "--- testo ---"; grep "\"text\"" /tmp/m.json | head -1 | cut -c1-500
echo "--- link (t) ---"; grep -oE "\"t\": \"[^\"]*\"" /tmp/m.json | head -50
