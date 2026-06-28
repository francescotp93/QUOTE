echo "=== clic CERCA + cattura rete (lookup veicolo) ==="
curl -s --max-time 55 "http://127.0.0.1:4700/explore?click=CERCA&sniff=1" 2>/dev/null | sed -E 's/(code|state|nonce|ENCODED|SMAGENTNAME)=[^"&]+/\1=<omesso>/g'
