echo "=== stato login adesso ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s --max-time 12 http://127.0.0.1:$port/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("loggato="+str(d.get("loggato")),"step="+str(d.get("login_step","")))' 2>/dev/null)"; done
echo "=== keep-alive AXA (ultime righe) ==="; journalctl -u axa-scraper.service --no-pager -n 250 2>/dev/null | sed -E 's/^.*\[axa\] //' | grep -iE "keep|alive|sessione|loggat|scadut|relogin|re-login" | tail -12
echo "=== keep-alive HDI (ultime righe) ==="; journalctl -u hdi-scraper.service --no-pager -n 250 2>/dev/null | sed -E 's/^.*\[hdi\] //' | grep -iE "keep|alive|sessione|loggat|scadut|relogin|auto-login|err" | tail -12
echo "=== uptime servizi ==="; for s in axa hdi groupama; do echo "$s up: $(systemctl show $s-scraper.service -p ActiveEnterTimestamp --value) R$(systemctl show $s-scraper.service -p NRestarts --value)"; done
