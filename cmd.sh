#!/usr/bin/env bash
set -u
S=http://127.0.0.1:4300
curl -s --max-time 90 "$S/explore?goto=%2F&sniff=1" > /tmp/plurima_home.json 2>/dev/null
echo "byte: $(wc -c < /tmp/plurima_home.json)"
node -e '
const d=JSON.parse(require("fs").readFileSync("/tmp/plurima_home.json","utf8"));
const walk=(o,p="",dep=0)=>{
  if(dep>2||o==null)return;
  if(Array.isArray(o)){ console.log(p,"= array["+o.length+"]"); if(o.length){console.log("   es[0]:",JSON.stringify(o[0]).slice(0,180));} return; }
  if(typeof o==="object"){ for(const k of Object.keys(o)){ const v=o[k]; const t=Array.isArray(v)?"array["+v.length+"]":typeof v; console.log(p+k,":",t); if(v&&typeof v==="object")walk(v,p+k+".",dep+1);} return;}
};
console.log("=== TOP KEYS ==="); walk(d);
';  echo "FINE."
