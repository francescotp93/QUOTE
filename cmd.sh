set +e
echo "== autopull(40s)+restart =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== con preambolo + residenza + situazione + pacchetto (debug) =="; T0=$(date +%s)
timeout 80 curl -s --max-time 75 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&prov=TP&comune=MARSALA&cap=91025&debug=1" 2>&1 | head -c 1400; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
