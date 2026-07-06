set +e
echo "== env proxy prima =="; systemctl show prima-scraper.service -p Environment 2>/dev/null | grep -io "PRIMA_PROXY=[^ ]*" || echo "PRIMA_PROXY non impostato"
echo "== IP pubblico del server =="; timeout 8 curl -s --max-time 6 https://ifconfig.me 2>/dev/null; echo ""
echo "== trigger login + attendo =="; timeout 12 curl -s --max-time 10 "http://127.0.0.1:4600/accedi" 2>/dev/null | head -c 120; echo ""
sleep 18
echo "== dump pagina (explore) =="; timeout 20 curl -s --max-time 18 "http://127.0.0.1:4600/logindump" 2>/dev/null | head -c 500; echo ""
echo "== SHOT_START =="; timeout 15 curl -s --max-time 12 "http://127.0.0.1:4600/shot" 2>/dev/null | base64 -w0 | head -c 900000; echo ""; echo "== SHOT_END =="
echo "---fine---"
