echo "=== click DANNI, dump grezzo (url + primi link) ==="
curl -s --max-time 45 "http://127.0.0.1:4700/explore?click=DANNI&all=1" 2>&1 | head -c 1100
