cd /opt/withus-backend 2>/dev/null || cd /opt/*backend* 2>/dev/null
echo "=== attendo autopull commit a41603b ==="
for i in $(seq 1 30); do
  git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
  L=$(git rev-parse HEAD 2>/dev/null | cut -c1-7)
  echo "  $i: HEAD=$L"
  [ "$L" = "a41603b" ] && { echo "fix presente"; break; }
  sleep 4
done
echo "=== sintassi moduli ==="
node --check scraper/groupama/quote-service.mjs 2>&1 && echo "groupama OK" || echo "groupama KO"
node --check server/fonti.js 2>&1 && echo "fonti OK" || echo "fonti KO"
echo "=== endpoint nuovi cablati nello scraper? ==="
grep -c "/accedi\|/resend\|doCodice\|HOLD" scraper/groupama/quote-service.mjs
echo "=== stato groupama (NON avvio login, solo /status) ==="
for i in $(seq 1 15); do
  S=$(curl -s --max-time 6 http://127.0.0.1:4500/status 2>/dev/null)
  ST=$(echo "$S" | sed -n 's/.*"login_step":"\([^"]*\)".*/\1/p')
  echo "  $i: step=$ST"
  [ -n "$ST" ] && { echo "$S"; break; }
  sleep 4
done
echo "=== backend espone /accedi /conferma-codice /altro-codice ? ==="
grep -c "accedi\|conferma-codice\|altro-codice\|login_guidato" server/fonti.js
