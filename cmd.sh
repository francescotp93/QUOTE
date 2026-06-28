echo "=== clic su EMISSIONE MOTOR + cattura rete ==="
curl -s --max-time 55 "http://127.0.0.1:4700/explore?click=EMISSIONE&sniff=1" 2>/dev/null | sed -E 's/(code|state|nonce|SMAGENTNAME|ENCODED|GUID|access_token|id_token)=[^"&]+/\1=<omesso>/g'
