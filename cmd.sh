echo "=== vado diretto all'app ISA ==="
curl -s --max-time 50 "http://127.0.0.1:4500/explore?goto=https://accedi.groupama.it/pda/PR_ISA&all=1" 2>&1 > /tmp/isa.json
echo "--- url/frame/npages ---"; grep -iE "\"url\"|\"frame\"|npages|\"frames\"" /tmp/isa.json | head -8
echo "--- testo ISA ---"; grep -iE "\"text\"" /tmp/isa.json | head -1
echo "--- campi ---"; grep -iE "\"name\":|\"placeholder\":|\"id\":" /tmp/isa.json | head -25
echo "--- link/bottoni ISA (trattativa/nuovo preventivo) ---"; grep -iE "\"t\":|trattat|preventiv|nuovo|auto" /tmp/isa.json | head -40
