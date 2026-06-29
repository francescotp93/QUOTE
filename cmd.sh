echo "stato scraper: $(systemctl is-active allianz-scraper)"
# attendo che il nodo risponda
for i in $(seq 1 15); do curl -s --max-time 5 http://127.0.0.1:4200/status >/dev/null 2>&1 && break; sleep 3; done
echo "=== pausa keep-alive 30 min ==="
curl -s --max-time 10 "http://127.0.0.1:4200/pausakeepalive?min=30" 2>/dev/null; echo
echo "=== status ==="
curl -s --max-time 8 "http://127.0.0.1:4200/status" 2>/dev/null; echo
echo "=== VNC ==="
ss -ltn 2>/dev/null | grep -q ':5901' && echo "5901 ATTIVO" || echo giu
