set +e
echo "== autopull(40s)+restart groupama =="; sleep 40
sudo systemctl restart groupama-scraper.service 2>&1 | head -1; sleep 8
for i in $(seq 1 25); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4500/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== 1) BASE solo RCA (infortuni=0) GY263BY =="; T0=$(date +%s)
timeout 130 curl -s --max-time 125 "http://127.0.0.1:4500/premio?targa=GY263BY&infortuni=0" 2>&1 | head -c 500; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "== 2) PACCHETTO infortuni GY263BY =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4500/premio?targa=GY263BY" 2>&1 | head -c 700; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
