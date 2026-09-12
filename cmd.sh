f=/opt/withus-backend/scraper/axa/auth.json
echo "sorveglio auth.json di AXA per 3 minuti, una lettura ogni 15 secondi"
for i in $(seq 1 12); do
  printf '%s  axa=%s  groupama=%s\n' "$(date '+%T')" "$(date -r $f '+%T')" "$(date -r /opt/withus-backend/scraper/groupama/auth.json '+%T')"
  sleep 15
done
echo "== ultimi log axa"
journalctl -u axa-scraper --since '-8min' --no-pager 2>&1 | grep -i 'keep-alive\|sessione' | tail -8
