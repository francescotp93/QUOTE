set -u
echo "=== Groupama (atteso: pronto) ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status" 2>/dev/null; echo
echo "=== Prima: service installato? ==="
systemctl is-active prima-scraper 2>/dev/null || echo "(non ancora installato — autopull npm+browser in corso)"
echo "=== Prima /status (porta 4600) ==="
PS=$(curl -s --max-time 8 "http://127.0.0.1:4600/status" 2>/dev/null)
if [ -n "$PS" ]; then echo "$PS"; echo "=== avvio login Prima (TOTP auto) ==="; curl -s --max-time 15 "http://127.0.0.1:4600/login" 2>/dev/null; echo; else echo "(scraper Prima non ancora su)"; fi
