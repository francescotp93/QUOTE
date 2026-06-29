systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 30); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "login guidato dal pannello" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 20); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
echo "=== /status (sessione sopravvissuta al restart?) ==="
curl -s --max-time 8 http://127.0.0.1:4200/status 2>/dev/null; echo
echo "=== /accedi (gia loggato: deve tornare step=loggato senza chiedere codice) ==="
curl -s --max-time 60 -X POST http://127.0.0.1:4200/accedi 2>/dev/null; echo
sleep 2
echo "=== /loginstate ==="
curl -s --max-time 8 http://127.0.0.1:4200/loginstate 2>/dev/null; echo
