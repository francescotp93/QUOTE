set +e
echo "== dove logga lo scraper (start-service.sh) =="
grep -iE "log|>>|tee|node " /opt/withus-backend/scraper/hdi/start-service.sh 2>&1 | head -10
echo "== cerco il file di log dello scraper =="
ls -lat /opt/withus-backend/scraper/hdi/*.log /opt/withus-backend/scraper/hdi/logs/* /var/log/hdi* 2>/dev/null | head -5
echo "== percorso PUBBLICO come il browser (senza token → deve dare 401 veloce) =="
T0=$(date +%s); curl -s --max-time 30 "https://api.withusassicurazioni.it/moto/premio-casa?provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5" -w "\nHTTP:%{http_code} t:%{time_total}s\n" 2>&1 | tail -c 300; echo " [wall $(($(date +%s)-T0))s]"
echo "---fine---"
