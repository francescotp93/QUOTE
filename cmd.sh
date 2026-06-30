curl -s -m 15 "http://127.0.0.1:4200/pausakeepalive?min=30" >/dev/null 2>&1
echo "--- click motor, poi coda (iframe) ---"
R=$(curl -s -m 80 "http://127.0.0.1:4200/explore?click=Preventivo%20Motor&wait=16000" 2>/dev/null)
echo "$R" | grep -E '"url"|"bodylen"|"title"' 
echo "--- ultimi 1200 char (iframe) ---"
echo "$R" | tail -c 1200
