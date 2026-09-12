echo "ora: $(date '+%F %T %Z')"
echo "=== AXA adesso"
curl -s -m 25 http://127.0.0.1:4700/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("loggato:",d.get("loggato"),"| passo:",d.get("login_step"),"| msg:",(d.get("login_msg") or "")[:60]);print("url:",(d.get("url") or "")[:110])' 2>/dev/null
echo "=== giornale AXA ultimi 6 minuti"
journalctl -u axa-scraper --since '-6min' --no-pager 2>/dev/null | tail -12 | cut -c1-180
echo "=== GROUPAMA adesso"
curl -s -m 25 http://127.0.0.1:4500/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("loggato:",d.get("loggato"),"| passo:",d.get("login_step"),"|",(d.get("login_msg") or "")[:60])' 2>/dev/null
