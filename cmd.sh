set +e
echo "== autopull(40s)+restart hdi =="; sleep 40
sudo systemctl restart hdi-scraper.service 2>&1 | head -1
for i in $(seq 1 30); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
timeout 170 curl -s --max-time 165 "http://127.0.0.1:4400/premio?targa=GY263BY&nascita=17/07/1993&debug=1" > /dev/null 2>&1
ls -la /tmp/hdi-gar.jpg 2>&1
echo "== JPG_START =="; base64 -w0 /tmp/hdi-gar.jpg 2>/dev/null; echo ""; echo "== JPG_END =="
echo "---fine---"
