set +e
echo "== autopull(40s)+restart prima =="; sleep 40
sudo systemctl restart prima-scraper.service 2>&1 | head -1; sleep 8
echo "== stato prima =="; timeout 6 curl -s --max-time 5 "http://127.0.0.1:4600/status" 2>/dev/null | head -c 200; echo ""
echo "== Prima /premio GY263BY =="; T0=$(date +%s)
timeout 90 curl -s --max-time 85 "http://127.0.0.1:4600/premio?targa=GY263BY&nascita=17/07/1993&indirizzo=c.da%20casazze&cap=91025&citta=081011&civico=142&telefono=3273528483&annopatente=2011&debug=1" 2>&1 | head -c 700; echo ""; echo "  ($(($(date +%s)-T0))s)"
echo "---fine---"
