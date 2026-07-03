set +e
echo "== autopull(40s)+restart =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== A) senza residenza (mostra indirizzo live targa) =="
timeout 40 curl -s --max-time 35 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&situ=0&pacchetto=0&debug=1" 2>&1 | head -c 700; echo ""
echo "== B) con residenza TP/CUSTONACI/91015, situ=0 =="; T0=$(date +%s)
timeout 60 curl -s --max-time 55 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&prov=TP&comune=CUSTONACI&cap=91015&situ=0&pacchetto=0&debug=1" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "== C) con residenza + situazione + pacchetto =="; T0=$(date +%s)
timeout 70 curl -s --max-time 65 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&prov=TP&comune=CUSTONACI&cap=91015&debug=1" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
