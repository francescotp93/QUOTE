echo "=== controlli della pagina AXA step1 (cos'e' PROSEGUI?) ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore?all=1" 2>&1 > /tmp/ax.json
grep -iE "prosegui|\"t\":|\"href\"|\"id\"|\"name\"|\"type\"" /tmp/ax.json | head -40
