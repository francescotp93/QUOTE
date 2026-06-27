echo "=== explore fino a Fast auto, leggo URL della route ==="
curl -s --max-time 50 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA" 2>&1 >/dev/null
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Trattativa" 2>&1 >/dev/null
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=Nuovo%20preventivo%20auto" 2>&1 > /tmp/u.json
echo "--- url/frame ---"; grep -iE "\"url\"|\"frame\"" /tmp/u.json | head -4
echo "--- conferma Fast auto / targa ---"; grep -iE "fast auto|\"name\": \"targa\"" /tmp/u.json | head -3
