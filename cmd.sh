cd /opt/withus-backend 2>/dev/null
LAST=$(git rev-parse origin/claude/vibrant-tesla-o0glfd 2>/dev/null|cut -c1-7)
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; [ "$(git rev-parse HEAD|cut -c1-7)" = "$LAST" ] && break; sleep 6; done
ok=0; for i in $(seq 1 15); do curl -s --max-time 8 http://127.0.0.1:4700/status 2>/dev/null | grep -q login_step && { ok=$((ok+1)); [ $ok -ge 2 ] && break; } || ok=0; sleep 5; done
echo "=== avvio /accedi e misuro il tempo fino a loggato ==="
t0=$(date +%s)
curl -s --max-time 12 -X POST http://127.0.0.1:4700/accedi >/dev/null 2>&1
for i in $(seq 1 40); do
  S=$(curl -s --max-time 8 http://127.0.0.1:4700/loginstate 2>/dev/null)
  st=$(echo "$S" | sed -n 's/.*"step":"\([^"]*\)".*/\1/p')
  echo "  +$(( $(date +%s)-t0 ))s: $st"
  [ "$st" = "loggato" ] && { echo ">>> LOGGATO in $(( $(date +%s)-t0 ))s"; break; }
  [ "$st" = "attesa_otp" ] && { echo ">>> chiede il codice (30gg non attivo)"; break; }
  [ "$st" = "error" -o "$st" = "non_loggato" ] && { echo ">>> $st: $(echo "$S"|sed -n 's/.*"msg":"\([^"]*\)".*/\1/p')"; break; }
  sleep 3
done
