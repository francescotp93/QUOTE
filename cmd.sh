set +e
echo "== no restart, poll pronto =="
for i in $(seq 1 20); do echo "$(timeout 5 curl -s --max-time 4 http://127.0.0.1:4400/status 2>/dev/null)" | grep -q '"loggato":true' && { echo "pronto ${i}"; break; }; sleep 3; done
echo "== targa NOTA-BUONA CS228ZE (capture), residenza CUSTONACI/TP =="; T0=$(date +%s)
timeout 80 curl -s --max-time 75 "http://127.0.0.1:4400/premio-motor?targa=CS228ZE&nascita=19/03/1957&prov=TP&comune=CUSTONACI&cap=91015&pacchetto=0&debug=1" 2>&1 | head -c 1300; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
