systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "Prima: fonte built-in" && break; sleep 5; done
echo "commit backend: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
echo "=== abilito + avvio prima-scraper (porta 4600) ==="
ls /etc/systemd/system/prima-scraper.service >/dev/null 2>&1 && echo "unit: SI" || echo "unit: NO"
systemctl enable --now prima-scraper 2>&1 | tail -2
sleep 8
echo "stato: $(systemctl is-active prima-scraper)"
echo "=== credenziali prima nel fonti.store.json? ==="
python3 -c "import json;s=json.load(open('/opt/withus-backend/server/fonti.store.json'));a=s.get('prima') or s.get('c-prima') or {};print('chiavi:',list(a.keys()));[print(' ',k,'=',('PRESENTE' if a.get(k) else 'vuoto')) for k in ('username','password','totp','codice','url')]" 2>&1 | head -8
echo "=== /status prima (porta 4600) ==="
for i in $(seq 1 12); do R=$(curl -s --max-time 6 http://127.0.0.1:4600/status 2>/dev/null); [ -n "$R" ] && { echo "$R" | head -c 300; break; }; sleep 4; done
