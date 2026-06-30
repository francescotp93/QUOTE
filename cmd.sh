echo "=== 1) goto /assuntivomotor/fast-quote ==="
curl -s -m 70 "http://127.0.0.1:4200/explore?goto=/assuntivomotor/fast-quote&wait=10000" 2>/dev/null | head -c 5000
echo ""
echo "=== 2) url corrente ==="
curl -s -m 20 "http://127.0.0.1:4200/status" 2>/dev/null | head -c 400
