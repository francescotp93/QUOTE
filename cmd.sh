echo "=== quante caselle di posta sono configurate (solo il conteggio e il dominio, nessun indirizzo intero)"
python3 - <<'PY'
import json,os,re
p='/opt/withus-backend/server/fonti.store.json'
try:
    d=json.load(open(p))
except Exception as e:
    print('store non leggibile:', e); raise SystemExit
mail=d.get('__caselle_mail') or d.get('caselle_mail') or {}
print('caselle configurate nel pannello:', len(mail))
for k in mail: print('  casella su dominio:', k.split('@')[-1])
env=open('/opt/withus-backend/server/.env').read() if os.path.exists('/opt/withus-backend/server/.env') else ''
print('MAIL_USER nell ambiente:', 'si' if re.search(r'^MAIL_USER=', env, re.M) else 'no')
PY
echo
echo "=== a quale indirizzo Groupama manda il codice (lo dice il portale, mascherato, nel giornale?)"
journalctl -u groupama-scraper --since '-7 days' --no-pager 2>/dev/null | grep -iE "inviato a|email|\*\*\*|destinatar" | tail -8 | cut -c1-180
