set -u
URL='https://idm.hdia.it/realms/mia/protocol/openid-connect/auth?client_id=uefa&redirect_uri=https%3A%2F%2Faccess.hdia.it%2Fuefa%2Fcallback&response_type=code&scope=openid+profile+email+api+giada-user&state=77a93a6e46d9493dac0810ff9e72fe09&code_challenge=gQC9FIGjjDvOl4u4a2X1s_wyBI16cBpGGXlrjl2C88E&code_challenge_method=S256&response_mode=query'
echo "=== 1) curl diretto endpoint OIDC auth (login form raggiungibile?) ==="
CODE=$(curl -s -o /tmp/a.html -w "%{http_code}" --max-time 25 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" "$URL")
echo "HTTP $CODE | bytes $(wc -c </tmp/a.html)"
grep -oiE "kc-form|kc-login|password|username|account temporarily|access denied|forbidden|realm|login" /tmp/a.html | sort | uniq -c | head
echo
echo "=== 2) scraper HDI guida l'URL (ha la sessione + browser vero) ==="
curl -s --max-time 90 "http://127.0.0.1:4400/explore?goto=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$URL")&sniff=1" -o /tmp/ex.json
node -e '
let d; try{ d=require("/tmp/ex.json"); }catch(e){ console.log("PARSE ERR"); process.exit(0);} 
console.log("url finale:", d.url||(d.dump&&d.dump.url)||"");
console.log("title:", (d.dump&&d.dump.title)||d.title||"");
console.log("text(250):", String((d.dump&&d.dump.text)||d.text||"").slice(0,250).replace(/\s+/g," "));
console.log("campi:", JSON.stringify(d.fields||(d.dump&&d.dump.ctrls)||[]).slice(0,400));
const calls=d.captured||d.sniff||[]; console.log("API catturate:", Array.isArray(calls)?calls.length:0);
'
