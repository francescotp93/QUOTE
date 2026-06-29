systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "due schermate" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 15); do curl -s --max-time 5 http://127.0.0.1:4200/status >/dev/null 2>&1 && break; sleep 3; done
curl -s --max-time 10 "http://127.0.0.1:4200/pausakeepalive?min=20" >/dev/null 2>&1
echo "=== /login (senza codice Duo: voglio vedere FIN DOVE arriva) ==="
curl -s --max-time 90 -X POST "http://127.0.0.1:4200/login" 2>/dev/null | head -c 300; echo
echo "=== journal: step del login ==="
journalctl -u allianz-scraper --no-pager -n 25 2>/dev/null | grep -iE "autoLogin|step|password|utente|duo|passcode|portal|loggato" | tail -18
