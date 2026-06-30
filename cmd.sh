curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "=== click Preventivo Motor ==="
curl -s -m 80 "http://127.0.0.1:4200/explore?click=Preventivo%20Motor&wait=12000" 2>/dev/null | head -c 6000
