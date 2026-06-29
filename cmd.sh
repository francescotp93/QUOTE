echo "=== journal allianz-scraper (ultime 30, filtrate login) ==="
journalctl -u allianz-scraper --no-pager -n 60 2>/dev/null | grep -iE "login|password|codice|totp|duo|mfa|err|accedi|sessione|grant|2fa|step" | tail -30
echo "=== VNC allianz attivo? (porta 5901) ==="
ss -ltn 2>/dev/null | grep -E ':5901' && echo "VNC SU" || echo "VNC giu"
