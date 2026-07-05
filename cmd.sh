set +e
echo "== trigger auto-login prima (TOTP) =="
timeout 15 curl -s --max-time 12 "http://127.0.0.1:4600/accedi" 2>/dev/null | head -c 200; echo ""
echo "== attendo loggato (max ~60s) =="
for i in $(seq 1 20); do S=$(timeout 5 curl -s --max-time 4 "http://127.0.0.1:4600/status" 2>/dev/null); echo "$S" | grep -q '"loggato":true' && { echo "LOGGATO dopo ${i}"; break; }; echo "$i: $(echo $S | grep -o '"login_step":"[^"]*"')"; sleep 4; done
echo "== Prima /premio GY263BY =="; T0=$(date +%s)
timeout 90 curl -s --max-time 85 "http://127.0.0.1:4600/premio?targa=GY263BY&nascita=17/07/1993&indirizzo=c.da%20casazze&cap=91025&citta=081011&civico=142&telefono=3273528483&annopatente=2011&debug=1" 2>&1 | head -c 700; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
