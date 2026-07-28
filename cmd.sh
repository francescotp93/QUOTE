#!/usr/bin/env bash
set -u
S=http://127.0.0.1:4300
echo "########## A) RC POLIZZA raggiungibile dal VPS? ##########"
for u in https://crm.rcpolizza.it/login https://crm.rcpolizza.it/ https://rcpolizza.it/; do
  code=$(curl -s -o /tmp/rc.html --max-time 25 -w '%{http_code}' -A "Mozilla/5.0" "$u" 2>/dev/null)
  echo "  $u -> HTTP ${code}  ($(wc -c </tmp/rc.html 2>/dev/null) byte)"
done
echo "  --- titolo/tecnologia pagina login (se 200) ---"
grep -oiE "<title>[^<]*</title>|name=\"(csrf|_token|email|username|password)\"|action=\"[^\"]*\"|laravel|react|vue|angular" /tmp/rc.html 2>/dev/null | head -12
echo
echo "########## B) PLURIMA dati (read-only via /api) ##########"
mostra(){ node -e '
  try{ const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const r=d.risposta!==undefined?d.risposta:d;
    const first = Array.isArray(r)? r[0] : (r&&r.data&&Array.isArray(r.data)? r.data[0] : (r&&r.aaData&&r.aaData[0]));
    console.log("  forma:", Array.isArray(r)?"array["+r.length+"]":(r&&typeof r==="object"?"{"+Object.keys(r).slice(0,20).join(",")+"}":typeof r));
    if(first) console.log("  campi record:", Object.keys(first).slice(0,30).join(", "));
    console.log("  estratto:", JSON.stringify(r).slice(0,220));
  }catch(e){console.log("  ERR",e.message)} ' "$1"; }
for act in dashboard_ituoinumeri carica_scadenze sospesi_contraente; do
  echo "── /api?action=$act ──"
  curl -s --max-time 70 "$S/api?action=$act&id_intermediario=3489" > /tmp/a.json 2>/dev/null
  mostra /tmp/a.json
done
echo "FINE."
