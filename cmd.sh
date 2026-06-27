echo "=== c'e' la stringa ISA nella pagina? clic su ISA ==="
curl -s --max-time 45 "http://127.0.0.1:4500/explore?click=ISA" 2>&1 | head -160
