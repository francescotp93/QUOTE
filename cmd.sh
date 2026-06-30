echo "=== click Sales ==="
curl -s -m 70 "http://127.0.0.1:4200/explore?click=Sales&wait=7000" 2>/dev/null | head -c 5000
