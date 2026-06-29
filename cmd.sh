echo "=== unit presente? ==="
ls /etc/systemd/system/allianz-scraper.service >/dev/null 2>&1 && echo SI || echo NO
echo "=== abilito + avvio allianz-scraper ==="
systemctl enable --now allianz-scraper 2>&1 | tail -2
sleep 6
echo "stato: $(systemctl is-active allianz-scraper)"
echo "=== credenziali Allianz nel fonti.store.json? (solo presenza, NON i valori) ==="
python3 -c "
import json
s=json.load(open('/opt/withus-backend/server/fonti.store.json'))
a=s.get('allianz') or {}
print('chiavi:', list(a.keys()))
for k in ('username','password','totp','codice','url'):
    v=a.get(k)
    print(' ',k,'=', ('PRESENTE' if v else 'vuoto'))
"
echo "=== attendo avvio nodo e leggo /status (porta 4200) ==="
for i in $(seq 1 15); do R=$(curl -s --max-time 6 http://127.0.0.1:4200/status 2>/dev/null); [ -n "$R" ] && { echo "$R"; break; }; sleep 4; done
