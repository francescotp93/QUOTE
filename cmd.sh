set +e
for i in $(seq 1 20); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4500/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== miiprobe FULL body1/sez1 GY263BY =="; T0=$(date +%s)
timeout 160 curl -s --max-time 155 "http://127.0.0.1:4500/miiprobe?targa=GY263BY" 2>&1 | tail -c 1600; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
