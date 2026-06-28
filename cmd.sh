cd /opt/withus-backend 2>/dev/null
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "caf03a0" ] && { echo "autopull ok"; break; }; sleep 6; done
ok=0; for i in $(seq 1 15); do S=$(curl -s --max-time 8 http://127.0.0.1:4700/status 2>/dev/null); echo "$S" | grep -q login_step && { ok=$((ok+1)); [ $ok -ge 2 ] && break; } || ok=0; sleep 5; done
echo "=== dove porta il link mobility.axa-italia.it/portal/ ? ==="
curl -s --max-time 50 "http://127.0.0.1:4700/explore?goto=https://mobility.axa-italia.it/portal/&all=1" 2>&1 > /tmp/m.json
grep -iE "\"url\"|\"title\"|user id|prosegui|password|log in|verifica" /tmp/m.json | head -10
echo "--- campi ---"; grep -iE "\"id\":|\"name\":|\"type\":" /tmp/m.json | head -12
