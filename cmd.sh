echo "=== compilo la targa GY263BY nel campo del modale Emissione Motor ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore?fill=GY263BY&fillsel=input%5Btype%3Dtext%5D%3Anot(%23searchBar)" 2>/dev/null | sed -E 's/(code|state|nonce|ENCODED)=[^"&]+/\1=<omesso>/g' | head -c 1500
