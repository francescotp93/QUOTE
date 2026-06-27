cd /opt/withus-backend 2>/dev/null
echo "=== attendo autopull a51740b ==="
for i in $(seq 1 30); do git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null; L=$(git rev-parse HEAD|cut -c1-7); [ "$L" = "a51740b" ] && { echo "ok $L"; break; }; echo "  $i:$L"; sleep 4; done
echo "=== riavvio groupama (pulisco lock per evitare context morto) ==="
rm -f scraper/groupama/userdata/Singleton* 2>/dev/null
sudo systemctl restart groupama-scraper.service 2>&1
sleep 10
echo "=== stato iniziale (pronto?) ==="
curl -s --max-time 8 http://127.0.0.1:4500/status; echo
echo "=== Accedi (sincrono) ==="
curl -s --max-time 90 -X POST http://127.0.0.1:4500/accedi; echo
echo "=== DUMP pagina (ora /logindump non e' piu' shadowed) ==="
curl -s --max-time 15 http://127.0.0.1:4500/logindump
echo
echo "=== log groupama ultimi 4 min ==="
journalctl -u groupama-scraper.service --since "-4 min" --no-pager 2>/dev/null | grep -iE "fill user|pass:|OTP|submit|recovery|err|loggato|schermata|goto" | tail -25
