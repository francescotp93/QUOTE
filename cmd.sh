cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "2c2e009" ] && { echo "ok"; break; }; sleep 6; done
ok=0; for i in $(seq 1 15); do curl -s --max-time 8 http://127.0.0.1:4700/status 2>/dev/null | grep -q login_step && { ok=$((ok+1)); [ $ok -ge 2 ] && break; } || ok=0; sleep 5; done
echo "=== porto la pagina sul login AXA ==="
curl -s --max-time 50 "http://127.0.0.1:4700/explore?goto=https://ais.axa-italia.it/" 2>&1 >/dev/null
sleep 2
echo "=== HTML esatto di PROSEGUI ==="
curl -s --max-time 20 "http://127.0.0.1:4700/probe?q=prosegui" 2>&1
