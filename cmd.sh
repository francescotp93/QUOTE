echo "=== HDI journal (auto-login durante il test) ==="
journalctl -u hdi-scraper.service --no-pager --since '13:46:00' 2>/dev/null | sed -E 's/^.*\[hdi\] //' | grep -iE "autologin|loggato|password|campi compilati|codice|duo|serve|non riuscito|keycloak" | tail -20
echo "=== HDI ha2fa nel pannello? (cerco nel backend la fonte) ==="
grep -iE "hdi" /opt/withus-backend/server/fonti.store.json 2>/dev/null | head -c 200; echo
echo "=== rilancio auto-login ORA e guardo dove finisce ==="
curl -s --max-time 70 "http://127.0.0.1:4400/login" >/dev/null 2>&1
sleep 25
curl -s --max-time 15 "http://127.0.0.1:4400/logindump" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('url:',d.get('url','')[:90]);print('title:',d.get('title',''));print('text:',d.get('text','')[:200]);print('campi:',[c.get('type')+':'+(c.get('id') or c.get('name') or c.get('label','')) for c in d.get('ctrls',[])][:10])" 2>/dev/null
