echo "=== apro NEXUS (uso lo scraper Groupama, gia' loggato sul portale) ==="
curl -s --max-time 55 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_GCP_nexus-web&all=1" 2>&1 > /tmp/nx.json
echo "--- url/frame/npages ---"; grep -iE "\"url\"|\"frame\"|npages" /tmp/nx.json | head -6
echo "--- testo ---"; grep "\"text\"" /tmp/nx.json | head -1 | cut -c1-700
echo "--- campi ---"; grep -iE "\"name\":|\"placeholder\":" /tmp/nx.json | head -15
echo "--- voci/bottoni (moto/autocarro/preventivo/nuovo) ---"; grep -iE "\"t\":|moto|autocarr|preventiv|nuovo|trattat|veicolo" /tmp/nx.json | head -40
