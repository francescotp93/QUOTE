cd /opt/withus-backend 2>/dev/null
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 25); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && { echo "deploy cache ok ($LAST)"; break; }; sleep 6; done
sleep 14
echo "=== cache attiva (groupama)? ==="
grep -c "logCache" scraper/groupama/quote-service.mjs
echo "=== RISORSE ==="; free -m | awk '/Mem:/{print "RAM "$4"MB liberi"}'; echo "load:$(uptime|grep -o 'average.*') chrome=$(pgrep -c -f chrome)"
echo "=== /status: groupama ora deve essere VELOCE (cache) ==="
for n in 1 2 3; do echo "  groupama tentativo $n: $(curl -s -o /dev/null -w '%{time_total}s' --max-time 12 http://127.0.0.1:4500/status 2>/dev/null)"; done
echo "=== tutti i quotanti ok ==="
for p in 4300:italiana 4400:hdi 4500:groupama 4100:moto 4700:axa; do port=${p%%:*}; nm=${p##*:}; echo "  $nm: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:$port/status 2>/dev/null)"; done
echo "=== servizi (riavvii nelle ultime modifiche) ==="
for s in italiana hdi groupama moto axa; do echo -n "$s=$(systemctl is-active $s-scraper.service)/$(systemctl show $s-scraper.service -p NRestarts --value) "; done; echo
