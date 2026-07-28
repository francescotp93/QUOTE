#!/usr/bin/env bash
# CARRELLATA PLURIMA — sola lettura. Home + struttura menu via /explore dello scraper italiana (4300).
set -u
S=http://127.0.0.1:4300
echo "=== /status ==="; curl -s --max-time 30 "$S/status" | head -c 300; echo
echo
echo "=== /explore?goto=/ (home + menu + sniff) ==="
curl -s --max-time 90 "$S/explore?goto=%2F&sniff=1" > /tmp/plurima_home.json 2>/dev/null
echo "byte ricevuti: $(wc -c < /tmp/plurima_home.json)"
echo "--- link/voci di menu trovate ---"
node -e '
try{
  const d=JSON.parse(require("fs").readFileSync("/tmp/plurima_home.json","utf8"));
  const s=d.struttura||d.risultato||d;
  const links=(s.link||s.links||s.menu||[]);
  console.log("URL corrente:", d.url||s.url||"?");
  if(Array.isArray(links)&&links.length){
    links.slice(0,60).forEach(l=>console.log(" •", (l.t||l.text||l.label||"").slice(0,40), "→", (l.href||l.url||"").slice(0,70)));
  } else {
    console.log("(nessun array link diretto; chiavi disponibili:", Object.keys(s).join(", "),")");
    console.log(JSON.stringify(s).slice(0,1200));
  }
  const aj=(d.sniff||d.api||s.ajax||[]);
  if(Array.isArray(aj)&&aj.length){ console.log("--- azioni __ajax.php intercettate ---"); aj.slice(0,30).forEach(a=>console.log("  action:", (a.action||a.a||a.url||JSON.stringify(a)).toString().slice(0,90))); }
}catch(e){ console.log("PARSE ERR:", e.message); console.log(require("fs").readFileSync("/tmp/plurima_home.json","utf8").slice(0,1500)); }
'
echo "FINE."
