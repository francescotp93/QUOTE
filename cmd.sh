echo "=== hover/click DANNI -> sottomenu ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore?hover=DANNI&all=1" 2>&1 >/dev/null
curl -s --max-time 40 "http://127.0.0.1:4700/explore?click=DANNI&all=1" 2>&1 > /tmp/d.json
grep "\"text\"" /tmp/d.json | head -1 | cut -c1-400
echo "--- voci dopo DANNI ---"
grep -oE "\"t\": \"[^\"]*\"" /tmp/d.json | head -40
