systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "pausa keep-alive" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
sleep 6
echo "=== attivo pausa keep-alive 30 min ==="
curl -s --max-time 10 "http://127.0.0.1:4200/pausakeepalive?min=30" 2>/dev/null
echo
echo "=== porto il browser sulla pagina di login Allianz e lo lascio pronto per te ==="
curl -s --max-time 30 "http://127.0.0.1:4200/login" 2>/dev/null | head -c 200
echo
echo "=== VNC up? ==="
ss -ltn 2>/dev/null | grep -q ':5901' && echo "VNC 5901 ATTIVO (pass: allianz2026)" || echo "VNC giu"
