echo "=== clic su Applicazioni ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=Applicazioni" 2>&1 | head -140
