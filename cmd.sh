set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== HDI quote debug (2 screenshot) =="; T0=$(date +%s)
timeout 170 curl -s --max-time 165 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&debug=1" > /dev/null 2>&1
echo "  done ($(($(date +%s)-T0))s)"; ls -la /tmp/hdi-gar.png /tmp/hdi-sconto.png 2>&1
echo "== GAR_START =="; base64 -w0 /tmp/hdi-gar.png 2>/dev/null; echo ""; echo "== GAR_END =="
echo "== SCT_START =="; base64 -w0 /tmp/hdi-sconto.png 2>/dev/null; echo ""; echo "== SCT_END =="
echo "---fine---"
