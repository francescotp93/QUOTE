echo "=== Allianz status dopo i test ANIA (la pagina principale è viva?) ==="
curl -s --max-time 10 "http://127.0.0.1:4200/status" 2>&1 | head -c 250; echo
