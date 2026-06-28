echo "=== /probe q=log (bottone LOG IN) ==="; curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=log%20in"
echo; echo "=== /explore all=1 (link/bottoni + campi pagina login) ==="; curl -s --max-time 25 "http://127.0.0.1:4700/explore?all=1"
