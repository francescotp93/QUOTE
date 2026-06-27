echo "=== 1) chiudo il modale (Piu' tardi) ==="
curl -s --max-time 30 "http://127.0.0.1:4500/explore?click=Pi%C3%B9%20tardi" 2>&1 | grep -iE "\"text\"|npages" | head -4
echo "=== 2) click Applicazioni + dump TUTTI i link ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=Applicazioni&all=1" 2>&1 > /tmp/isa2.json
grep -iE "isa|preventiv|auto|trattat|\"t\":" /tmp/isa2.json | head -70
echo "=== testo pagina ==="
grep -iE "\"text\"" /tmp/isa2.json | head -2
