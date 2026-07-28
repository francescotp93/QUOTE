#!/usr/bin/env bash
set -u
S=http://127.0.0.1:4300
echo "=== jsgrep: dove si usa __ajax.php (dispatcher) ==="
curl -s --max-time 90 "$S/jsgrep?q=__ajax&before=40&after=120" > /tmp/j.json 2>/dev/null
node -e 'try{const d=JSON.parse(require("fs").readFileSync("/tmp/j.json","utf8"));
console.log("file JS applicativi:", (d.filesCercati||[]).join(", "));
console.log("match:", d.matches);
(d.windows||[]).slice(0,6).forEach(w=>console.log("──",w.file,"──\n",w.snippet.replace(/\s+/g," ").slice(0,220)));
}catch(e){console.log("ERR",e.message, require("fs").readFileSync("/tmp/j.json","utf8").slice(0,300))}'
echo
echo "=== jsgrep: nomi azione tipo a:'...' ==="
curl -s --max-time 90 "$S/jsgrep?q=a%3A%20?%5B'%22%5D%5Ba-z_%5D%2B&before=10&after=30" > /tmp/j2.json 2>/dev/null
node -e 'try{const d=JSON.parse(require("fs").readFileSync("/tmp/j2.json","utf8"));const set=new Set();(d.windows||[]).forEach(w=>{const m=w.snippet.match(/a['"'"'"]?\s*[:=]\s*['"'"'"]([a-z_]{4,})/i);if(m)set.add(m[1]);});console.log("azioni trovate:",[...set].join(", ")||"(nessuna con questo pattern)");}catch(e){console.log("ERR",e.message)}'
echo "FINE."
