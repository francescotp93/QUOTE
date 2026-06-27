echo "=== goto ISA ==="
curl -s --max-time 50 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA" 2>&1 | grep "\"text\"" | head -1
echo "=== click Trattativa ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Trattativa" 2>&1 | grep "\"text\"" | head -1
echo "=== click Nuovo preventivo auto -> dump testo + campi ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=Nuovo%20preventivo%20auto&all=1" 2>&1 > /tmp/d.json
grep "\"text\"" /tmp/d.json | head -1
echo "--- campi ---"; grep -iE "\"name\":|targa" /tmp/d.json | head -12
echo "--- bottoni/voci ---"; grep -iE "\"t\":|crea|abbandon|continua|conferma|attenzione|in corso" /tmp/d.json | head -25
