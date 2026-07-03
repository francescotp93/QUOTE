set +e
echo "== autopull (40s) + restart robusto =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1
for i in $(seq 1 30); do S=$(timeout 5 curl -s --max-time 4 "http://127.0.0.1:4400/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo "pronto+loggato dopo ${i} tick"; break; }; sleep 3; done
echo "== A) /motor-targa GY263BY (qualità dati targa) =="
timeout 30 curl -s --max-time 25 "http://127.0.0.1:4400/motor-targa?targa=GY263BY&nascita=17/07/1993" 2>&1 | head -c 700; echo ""
echo "== B) /premio-motor situ=0 (salta situazione) =="; T0=$(date +%s)
timeout 60 curl -s --max-time 55 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&situ=0&pacchetto=0&debug=1" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "== C) /premio-motor con situazione (debug esteso) =="; T0=$(date +%s)
timeout 60 curl -s --max-time 55 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&pacchetto=0&debug=1" 2>&1 | head -c 900; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
