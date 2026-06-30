cd /opt/withus-backend
# assicuro il codice aggiornato (se autopull non ha ancora pullato)
if ! grep -q "guidaEsperta" scraper/allianz/quote-service.mjs 2>/dev/null; then
  git fetch origin claude/vibrant-tesla-o0glfd -q 2>/dev/null
  git reset --hard origin/claude/vibrant-tesla-o0glfd -q 2>/dev/null
fi
echo "guidaEsperta presente:" $(grep -c guidaEsperta scraper/allianz/quote-service.mjs)
sudo systemctl restart allianz-scraper.service 2>/dev/null
sleep 9
echo "--- status ---"
curl -s -m 20 "http://127.0.0.1:4200/status"
echo ""
echo "--- test premio (guida esperta, massimale 10M) ---"
curl -s -m 210 "http://127.0.0.1:4200/premio?targa=GY263BY&nascita=17/07/1993&tipo=auto&infortuni=1&guida=esperta&massimale=553000010000" 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print('ok:', d.get('ok'))
  print('premio_annuale:', d.get('premio_annuale'))
  print('pacchetto:', d.get('pacchetto'))
  print('garanzie_incluse:', d.get('garanzie_incluse'))
  print('error:', d.get('error'))
except Exception as e:
  print('parse err', e)
"
