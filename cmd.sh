set -u
echo "=== il codice deployato ha il nuovo login /uefa/? ==="
grep -c "appHome\|/uefa/" /opt/withus-backend/scraper/hdi/quote-service.mjs 2>/dev/null || echo "file non trovato"
echo "=== url HDI salvato in Fonti (non segreto) ==="
node -e 'try{const s=require("/opt/withus-backend/server/fonti.store.json");const c=(s.__custom||{});for(const k of Object.keys(c)){if(/hdi/i.test(c[k].nome||"")||k==="c-hdi")console.log(k,"=> url:",c[k].url||"(default)","| has2fa:",!!c[k].has2fa,"| codice:",!!c[k].codice);}}catch(e){console.log("err",e.message)}'
echo "=== ri-lancio login ==="
curl -s --max-time 130 "http://127.0.0.1:4400/login" | head -c 400; echo
echo "=== stato reale: /explore su /uefa/ (form login o app?) ==="
curl -s --max-time 80 "http://127.0.0.1:4400/explore?goto=https%3A%2F%2Faccess.hdia.it%2Fuefa%2F&sniff=1" -o /tmp/e.json
node -e 'try{const d=require("/tmp/e.json");console.log("url:",d.url||(d.dump&&d.dump.url));console.log("title:",(d.dump&&d.dump.title)||d.title);const f=d.fields||(d.dump&&d.dump.ctrls)||[];console.log("ha form login:",JSON.stringify(f).slice(0,300));}catch(e){console.log("err")}'
