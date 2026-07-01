set +e
sleep 25
sudo systemctl restart hdi-scraper.service 2>&1; echo "rc=$?"
sleep 35
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
for attempt in 1 2 3; do
  OUT=$(curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&debug=1")
  echo "$OUT" | grep -q '"ok": true' && { echo "$OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('LORDO',d.get('premio_totale'),'NETTO',d.get('netto_totale_num'),'IMPOSTE',d.get('imposte_totale_num'))
print('=== infoScontiPlafonate ==='); print(json.dumps(d.get('infoScontiPlafonate'),ensure_ascii=False,indent=1)[:1500])
print('=== infoPremiDiminuzione ==='); print(json.dumps(d.get('infoPremiDiminuzione'),ensure_ascii=False,indent=1)[:1500])
print('=== sconti_top ==='); print(json.dumps(d.get('sconti_top'),ensure_ascii=False))
print('=== campi minimo/plafond/massimo ==='); 
for x in d.get('minimi',[]): print('  ',x['campo'],'=',x['valore'])
"; break; } || { echo "tentativo $attempt fallito"; sleep 15; }
done
echo "---fine---"
