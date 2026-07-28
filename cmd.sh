#!/usr/bin/env bash
set -u
S=http://127.0.0.1:4300
curl -s --max-time 90 "$S/explore?goto=%2F&sniff=1" > /tmp/ph.json 2>/dev/null
node -e '
const d=JSON.parse(require("fs").readFileSync("/tmp/ph.json","utf8"));
console.log("TITLE:", d.title);
console.log("=== MENU ("+ (d.menu||[]).length +") ===");
(d.menu||[]).forEach((m,i)=>console.log(String(i).padStart(2),"·",m));
console.log("=== AZIONI __ajax.php (a=) intercettate in home ===");
(d.captured||[]).forEach(c=>{ if(c.kind==="req"){ const b=(c.body||""); const m=b.match(/(?:^|&)a=([^&]+)/); console.log("  a="+(m?m[1]:"?"), " | ", b.slice(0,90)); }});
';  echo "FINE."
