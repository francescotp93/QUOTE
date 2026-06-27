cd /opt/withus-backend
for i in $(seq 1 26); do h=$(git rev-parse --short HEAD); [ "$h" = "904fe6f" ] && { echo "deploy giro $i"; break; }; sleep 5; done
systemctl restart moto-scraper 2>/dev/null; sleep 2
B=http://127.0.0.1:4100
for i in $(seq 1 30); do curl -s -m 6 "$B/status" >/dev/null 2>&1 && { echo "up giro $i"; break; }; sleep 4; done
sleep 3
curl -s -m 10 "$B/sniff/start" >/dev/null
curl -s -m 188 "$B/flowmap?targa=FA85248&nascita=19/05/1995&comune=TRAPANI&cf=LMBNGL95E19D423D&steps=9" > /tmp/fm.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/fm.json"))
for i,s in enumerate(d.get("seq") or []):
  print(f"STEP{i}: ...{(s.get('url') or '')[-26:]} cf={s.get('cf')} comune={s.get('comune')} clicked={s.get('clicked')} PREZZI={s.get('prezzi')}")
PY
echo "=== chiamata PREMIO ==="
curl -s -m 15 "$B/sniff/stop" > /tmp/sn.json
python3 - <<'PY'
import json,re
d=json.load(open("/tmp/sn.json"))
seen=set()
for c in (d.get("chiamate") or []):
  u=(c.get("→") or c.get("url") or "").split("?")[0]
  if u and "ghost" not in u and "getuserdata" not in u and u not in seen: seen.add(u)
print("endpoint NUOVI (oltre i noti):")
known={'/api/motoplatinum/getPendingOperations','/api/product/v1/searchProduct','/api/product/v2/new/cvt','/api/product/v2/new/mp','/api/product/v2/set/cvt','/api/product/v2/set/mp','/api/quotation/v2/infobike/getbrands','/api/quotation/v2/infobike/getdetail','/api/quotation/v2/infobike/getmodels','/api/quotation/v2/infobike/getversions'}
for x in sorted(seen):
  xx=x.replace('GET ','').replace('POST ','')
  if xx not in known and 'istat' not in xx: print("  *",x)
print("\n=== risposte con prezzo ===")
for c in (d.get("chiamate") or []):
  if "←" in c and c.get("body") and re.search(r'"(premium|amount|price|netAmount|grossAmount|totalPremium|importo)"|\b\d{2,4}[.,]\d{2}\b', c.get("body","")):
    u=c.get("url","")
    if any(k in u for k in ['ghost','istat','searchProduct','set/','new/','infobike','getdetail']): continue
    print(f"[{c.get('t')}] <-{c.get('←')} {u}"); print("  resp:",c["body"][:1500])
PY
