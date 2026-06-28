echo "grep debug live: $(grep -c '_dbg.immatr' /opt/withus-backend/scraper/axa/quote-service.mjs)  start $(date +%T)"
curl -s --max-time 225 "http://127.0.0.1:4700/premio?targa=GY263BY&cf=DDOFNC93L17D423L&cognome=ODDO&nome=FRANCESCO&data_nascita=17%2F07%2F1993" 2>/dev/null
echo; echo "end $(date +%T)"
