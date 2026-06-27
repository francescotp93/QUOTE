set -u
echo "=== STOP immediato scraper Groupama (blocca lo spam OTP) ==="
systemctl stop groupama-scraper 2>/dev/null && echo "FERMATO"
echo "=== quante volte ha inviato credenziali / chiesto codice? (ultimi 2 min) ==="
journalctl -u groupama-scraper --no-pager --since "3 min ago" 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "fill user|pagina OTP|codice ricevuto|invio|recovery" | tail -30
echo "=== conteggio 'fill user' (= tentativi login) ==="
journalctl -u groupama-scraper --no-pager --since "5 min ago" 2>/dev/null | grep -c "fill user/pass"
