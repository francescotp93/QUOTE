curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "=== goto sales + click Preventivo Motor (atomico) ==="
curl -s -m 90 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/matrix/sales/&click=Preventivo%20Motor&wait=14000" 2>/dev/null | head -c 7000
