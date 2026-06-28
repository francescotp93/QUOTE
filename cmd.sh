echo "=== RISORSE (dopo ottimizzazione) ==="; free -m | awk '/Mem:/{print "RAM "$4"MB liberi / "$2"MB tot"}'; echo "load:$(uptime|grep -o 'average.*')  chrome_proc=$(pgrep -c -f chrome)"
echo "=== quotanti /status http + NRestarts ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: http=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 http://127.0.0.1:$port/status)  R$(systemctl show $nm-scraper.service -p NRestarts --value 2>/dev/null)"; done
echo "=== backend rotta AXA + withus-backend ==="; echo "preventivoAxa=$(grep -c preventivoAxa /opt/withus-backend/server/moto.js)  backend=$(systemctl is-active withus-backend)"
echo "=== AXA loggato? ==="; curl -s --max-time 14 http://127.0.0.1:4700/status | python3 -c "import sys,json;d=json.load(sys.stdin);print('login_step:',d.get('login_step'),'| loggato:',d.get('loggato'),'| msg:',d.get('login_msg',''))" 2>/dev/null
