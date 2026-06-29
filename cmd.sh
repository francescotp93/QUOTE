grep -q '^HDI_SCRAPER_URL=' /opt/withus-backend/server/.env && sed -i 's#^HDI_SCRAPER_URL=.*#HDI_SCRAPER_URL=http://127.0.0.1:4401#' /opt/withus-backend/server/.env || echo 'HDI_SCRAPER_URL=http://127.0.0.1:4401' >> /opt/withus-backend/server/.env
systemctl disable --now hdi-scraper >/dev/null 2>&1
systemctl restart withus-backend; sleep 4
echo "env: $(grep HDI_SCRAPER_URL /opt/withus-backend/server/.env)  hdi-locale=$(systemctl is-active hdi-scraper)  tunnel=$(systemctl is-active hdi-tunnel)"
echo "start $(date +%T) — preventivo HDI via tunnel (IP fidato del vecchio)"
curl -s --max-time 175 "http://127.0.0.1:4401/premio?targa=GY263BY&nascita=17%2F07%2F1993" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('ok:',d.get('ok'),'premio:',d.get('premio_annuale'))" 2>/dev/null
echo "end $(date +%T)"
