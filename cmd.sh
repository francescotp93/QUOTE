echo "ora: $(date '+%F %T %Z')"
echo "=== AXA /verifica (non fa login, non consuma tentativi)"
curl -s -m 90 http://127.0.0.1:4700/verifica | head -c 400
echo; echo "=== stato subito dopo"
curl -s -m 30 http://127.0.0.1:4700/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("loggato:",d.get("loggato"),"| url:",(d.get("url") or "")[:100])' 2>/dev/null
echo "=== giornale"
journalctl -u axa-scraper --since '-3min' --no-pager 2>/dev/null | tail -8 | cut -c1-180
