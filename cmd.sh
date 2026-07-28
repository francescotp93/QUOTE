#!/usr/bin/env bash
set -u
S=http://127.0.0.1:4300
echo "=== catalogo azioni Plurima (pattern \"a\":\"...\" nei JS) ==="
curl -s --max-time 110 "$S/jsgrep?q=%22a%22%5Cs*%3A%5Cs*%22%5Ba-z_%5D%7B3%2C%7D%22&before=0&after=40" > /tmp/cat.json 2>/dev/null
node -e '
try{const d=JSON.parse(require("fs").readFileSync("/tmp/cat.json","utf8"));
console.log("file:", (d.filesCercati||[]).join(", "), "| finestre:", d.matches);
const set=new Set();
(d.windows||[]).forEach(w=>{ const m=w.snippet.match(/"a"\s*:\s*"([a-z_]{3,})"/i); if(m)set.add(m[1]); });
console.log("AZIONI ("+set.size+"):", [...set].sort().join(", "));
}catch(e){console.log("ERR",e.message)}'
echo "FINE."
