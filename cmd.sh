set +e
echo "== attendo prontezza /status (no restart, codice già attivo) =="
for i in $(seq 1 20); do
  S=$(timeout 5 curl -s --max-time 4 "http://127.0.0.1:4400/status" 2>/dev/null)
  if [ -n "$S" ]; then echo "pronto dopo ${i} tick: $(echo $S | head -c 120)"; break; fi
  sleep 3
done
echo "== 1) BASE solo RCA (pacchetto=0) GY263BY =="; T0=$(date +%s)
timeout 95 curl -s --max-time 90 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&pacchetto=0&debug=1" 2>&1 | head -c 1200; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "== 2) PACCHETTO completo GY263BY =="; T0=$(date +%s)
timeout 95 curl -s --max-time 90 "http://127.0.0.1:4400/premio-motor?targa=GY263BY&nascita=17/07/1993&debug=1" 2>&1 | head -c 1200; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
