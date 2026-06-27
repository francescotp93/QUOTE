set -u
echo "=== stato + dove siamo ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
curl -s --max-time 25 "http://127.0.0.1:4500/logindump" -o /tmp/g.json
node -e 'try{const d=require("/tmp/g.json");console.log("url:",d.url,"| title:",d.title);console.log("text:",String(d.text||"").slice(0,200).replace(/\s+/g," "));console.log("CAMPI:",JSON.stringify(d.ctrls||[]).slice(0,400));}catch(e){console.log("dump err")}'
echo "=== log (cosa fa con il codice) ==="
journalctl -u groupama-scraper --no-pager -n 14 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "codice|invio|inseris|loggato|OTP|fill|err|altro" | tail -10
