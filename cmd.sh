echo "=== 24H Moto Platinum scraper (4100) /status ==="
curl -s -m 12 "http://127.0.0.1:4100/status" || echo "  (non risponde)"
echo; echo "=== service 24H moto attivo? ==="
systemctl is-active moto-scraper 2>/dev/null || echo "n/d"
pgrep -af 'scraper/moto/quote-service.mjs' | head -2
echo; echo "=== Plurima /preventivazione: azioni JS (mappa) ==="
curl -s -m 90 "http://127.0.0.1:4300/explore?goto=/preventivazione&grepjs=1" | python3 -c '
import sys,json,re
d=json.load(sys.stdin)
g=d.get("grepjs") or {}
print("files:",g.get("files"))
acts=g.get("actions") or []
print("totale azioni:",len(acts))
print("prodotto/ricerca/moto:",[a for a in acts if re.search(r"prodott|ricerc|search|moto|ciclo|veicol|tariff|quotaz",a,re.I)])
' 2>/dev/null
