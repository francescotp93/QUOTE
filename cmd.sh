set +e
echo "== autopull (38s) =="; sleep 38
sudo systemctl restart hdi-scraper.service 2>&1; sleep 20
echo "== 1) BASE solo RCA (pacchetto=0) GY263BY =="; T0=$(date +%s)
timeout 95 curl -s --max-time 90 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&pacchetto=0&debug=1" 2>&1 | head -c 1100; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "== 2) PACCHETTO completo GY263BY =="; T0=$(date +%s)
timeout 95 curl -s --max-time 90 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&debug=1" 2>&1 | head -c 1100; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
