echo "=== /logindump (form SiteMinder attuale) ==="
curl -s --max-time 20 http://127.0.0.1:4700/logindump
echo; echo "=== /probe q=prosegui ==="; curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=prosegui"
echo; echo "=== /probe q=accedi ==="; curl -s --max-time 15 "http://127.0.0.1:4700/probe?q=accedi"
