echo "=== lancio un tentativo di Accedi (sincrono) ==="
curl -s --max-time 90 -X POST http://127.0.0.1:4500/accedi 2>&1; echo
echo "=== DOVE si e' fermata la pagina (url/title/testo/controlli) ==="
curl -s --max-time 15 http://127.0.0.1:4500/logindump 2>&1
echo
echo "=== log groupama ultimi 3 min ==="
journalctl -u groupama-scraper.service --since "-3 min" --no-pager 2>/dev/null | grep -iE "fill user|pass|OTP|codice|submit|recovery|err|loggato|schermata" | tail -25
