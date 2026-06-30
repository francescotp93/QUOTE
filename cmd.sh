curl -s -m 15 "http://127.0.0.1:4200/sniff/start" >/dev/null 2>&1
echo "=== home + cerca 'Preventivo Motor' ==="
curl -s -m 70 "http://127.0.0.1:4200/explore?goto=/matrix/&type=Preventivo%20Motor&enter=1&wait=8000" 2>/dev/null | head -c 4500
