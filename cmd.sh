for n in 1 2 3; do
  echo "=== Conferma lettura ($n) ==="
  curl -s --max-time 30 "http://127.0.0.1:4500/explore?click=Conferma%20lettura" 2>&1 | grep -iE "\"text\"" | head -1
done
echo "=== stato dopo: testo + link (cerco se sparito il modale e se appare ISA) ==="
curl -s --max-time 40 "http://127.0.0.1:4500/explore?all=1" 2>&1 > /tmp/m.json
grep -iE "\"text\"" /tmp/m.json | head -1
grep -iE "isa|conferma lettura|preventiv|trattat" /tmp/m.json | head -20
