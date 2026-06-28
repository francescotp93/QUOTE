echo "=== apro Nexus ==="
curl -s --max-time 55 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_GCP_nexus-web" 2>&1 | grep "\"url\"" | head -1
echo "=== menu: cerco 'Nuova proposta' tra i link (dump completo, anche nascosti) ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?all=1" 2>&1 > /tmp/nx2.json
grep -iE "proposta|portafoglio|nuova|preventiv|polizza|emissione" /tmp/nx2.json | head -30
echo "=== provo a cliccare Portafoglio ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?click=Portafoglio&all=1" 2>&1 > /tmp/nx3.json
grep "\"text\"" /tmp/nx3.json | head -1 | cut -c1-500
echo "--- voci dopo Portafoglio ---"
grep -iE "\"t\":|proposta|nuova|preventiv|polizza" /tmp/nx3.json | head -30
