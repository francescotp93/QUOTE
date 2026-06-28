echo "=== Groupama /status ==="
curl -s --max-time 12 http://127.0.0.1:4500/status 2>&1; echo
echo "=== ISA richiede login? (apro la route quotazione) ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA" 2>&1 | grep -iE "\"url\"|\"text\"" | head -2 | cut -c1-220
