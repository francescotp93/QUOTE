echo "=== home vera (url completo) ==="
curl -s -m 70 "http://127.0.0.1:4200/explore?goto=https://portaleagenzie.allianz.it/matrix/&wait=10000" 2>/dev/null | head -c 5000
