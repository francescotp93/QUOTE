#!/usr/bin/env bash
# Espandi tendine + cattura endpoint-dati reali (read-only)
set -u
S=http://127.0.0.1:4300
for voce in Amministrazione Utilità Prodotti; do
  echo "══════════ tendina: $voce ══════════"
  curl -s --max-time 60 "$S/explore?click=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$voce")&sniff=1" > /tmp/dd.json 2>/dev/null
  node -e '
  try{ const d=JSON.parse(require("fs").readFileSync("/tmp/dd.json","utf8"));
    const vis=(d.menu||[]).filter(m=>m&&!/^tel:|^\+99|^Francesco/.test(m)&&m.includes("→"));
    vis.slice(0,30).forEach(m=>console.log("   ",m));
  }catch(e){console.log("  ERR",e.message);} '
done
echo "══════════ endpoint-dati polizze (url+body reali) ══════════"
curl -s --max-time 90 "$S/explore?goto=%2Fpolizze&sniff=1" > /tmp/p.json 2>/dev/null
node -e 'const d=JSON.parse(require("fs").readFileSync("/tmp/p.json","utf8"));(d.captured||[]).filter(c=>c.kind==="req").forEach(c=>console.log("  ",c.method,c.url,"|",(c.body||"").slice(0,80)));'
echo "══════════ endpoint-dati estratti-conto ══════════"
curl -s --max-time 90 "$S/explore?goto=%2Festratti-conto&sniff=1" > /tmp/e.json 2>/dev/null
node -e 'const d=JSON.parse(require("fs").readFileSync("/tmp/e.json","utf8"));(d.captured||[]).filter(c=>c.kind==="req").forEach(c=>console.log("  ",c.method,c.url,"|",(c.body||"").slice(0,80)));'
echo "FINE."
