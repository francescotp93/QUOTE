echo "host=$(hostname)"
echo "RAM $(free -m|awk '/Mem:/{print $4"/"$2"MB"}')  load:$(uptime|grep -o 'average.*')"
echo "backend=$(systemctl is-active withus-backend)  autopull=$(systemctl is-active withus-autopull.timer)  cmd=$(systemctl is-active cmd-runner.timer)"
for c in italiana hdi groupama moto axa; do echo -n "$c=$(systemctl is-active $c-scraper) "; done; echo
echo "--- login/credenziali ---"
for p in 4300:italiana 4400:hdi 4500:groupama 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s --max-time 12 http://127.0.0.1:$port/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print("cred="+str(d.get("ha_credenziali")),"loggato="+str(d.get("loggato")),"step="+str(d.get("login_step","")))' 2>/dev/null)"; done
