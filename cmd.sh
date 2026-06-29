echo "host=$(hostname)  (vps-d6443a46 = NUOVO)"
echo "RAM $(free -m|awk '/Mem:/{print $4"/"$2"MB liberi"}')  load:$(uptime|grep -o 'average.*')  chrome=$(pgrep -c -f chrome)"
echo "backend=$(systemctl is-active withus-backend)"
for c in italiana hdi groupama moto axa; do echo -n "$c=$(systemctl is-active $c-scraper)/R$(systemctl show $c-scraper -p NRestarts --value) "; done; echo
echo "--- HDI fix recupero presente? $(grep -c 'recupero: re-login + home + nodo' /opt/withus-backend/scraper/hdi/quote-service.mjs) ---"
echo "--- login ---"
for p in 4300:italiana 4400:hdi 4500:groupama 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s --max-time 12 http://127.0.0.1:$port/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("loggato="+str(d.get("loggato")),"step="+str(d.get("login_step","")))' 2>/dev/null)"; done
