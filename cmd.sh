echo "=== PRIMA: struttura pagina di login (campi/bottoni) ==="
curl -s --max-time 50 "http://127.0.0.1:4600/explore?goto=https://intermediari.prima.it/login&all=1" 2>&1 > /tmp/p.json
echo "--- url ---"; grep "\"url\"" /tmp/p.json | head -1
echo "--- testo ---"; grep "\"text\"" /tmp/p.json | head -1 | cut -c1-400
echo "--- campi ---"; grep -iE "\"type\":|\"name\":|\"placeholder\":|\"id\":" /tmp/p.json | head -25
echo "--- bottoni/link ---"; grep -iE "\"t\":" /tmp/p.json | head -20
echo
echo "=== GROUPAMA: riporto la pagina alla home e ricontrollo stato ==="
curl -s --max-time 30 http://127.0.0.1:4500/status 2>&1; echo
