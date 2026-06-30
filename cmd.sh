curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "--- step1: render Sales ---"
curl -s -m 40 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/matrix/sales/&wait=9000" 2>/dev/null | grep -o '"url": "[^"]*"' | head -1
curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "--- step2: click Preventivo Motor (pagina gia' renderizzata) ---"
curl -s -m 80 "http://127.0.0.1:4200/explore?click=Preventivo%20Motor&wait=15000" 2>/dev/null | head -c 6000
