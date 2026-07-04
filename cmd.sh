set +e
echo "== health servizi =="
for p in 4200 4500; do echo -n "porta $p: "; timeout 6 curl -s --max-time 5 "http://127.0.0.1:$p/status" 2>/dev/null | head -c 160; echo ""; done
echo ""
echo "== GROUPAMA miiprobe (infortuni conducente) GY263BY =="; T0=$(date +%s)
timeout 150 curl -s --max-time 145 "http://127.0.0.1:4500/miiprobe?targa=GY263BY" 2>&1 | head -c 1500; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo ""
echo "== ALLIANZ premio (pacchetto attuale) GY263BY =="; T0=$(date +%s)
timeout 150 curl -s --max-time 145 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993&tipo=auto" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
