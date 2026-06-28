echo "=== clic VAI ALLA QUOTAZIONE + cattura ==="
curl -s --max-time 55 "http://127.0.0.1:4700/explore?click=VAI%20ALLA%20QUOTAZIONE&sniff=1" 2>/dev/null | sed -E 's/(code|state|nonce|ENCODED|SMAGENTNAME)=[^"&]+/\1=<omesso>/g' | sed -E 's/"body": "[^"]{600}/"body": "<troncato>/g'
