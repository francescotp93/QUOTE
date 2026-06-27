set -u
echo "=== nativo deployato? (cerco page.locator + waitFor) ==="
grep -c "waitFor({ state: 'visible'" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null
grep -c "getByRole" /opt/withus-backend/scraper/groupama/quote-service.mjs 2>/dev/null
echo "=== avvio login Groupama + Prima ==="
curl -s --max-time 12 "http://127.0.0.1:4500/login" >/dev/null 2>&1
curl -s --max-time 12 "http://127.0.0.1:4600/login" >/dev/null 2>&1
sleep 35
echo "=== LOG groupama (dove si ferma) ==="
journalctl -u groupama-scraper --no-pager -n 14 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "fill|user|pass|OTP|pagina|credenziali|loggato|err|PRONTO|step" | tail -10
echo "=== LOG prima ==="
journalctl -u prima-scraper --no-pager -n 14 2>/dev/null | sed 's/.*\[prima\]/[prima]/' | grep -iE "fill|user|pass|OTP|pagina|credenziali|loggato|err|PRONTO|2fa" | tail -10
