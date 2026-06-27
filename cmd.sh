set -u
echo "=== stato Groupama ora ==="
curl -s --max-time 8 "http://127.0.0.1:4500/status"; echo
echo "=== dove siamo (pagina) ==="
curl -s --max-time 25 "http://127.0.0.1:4500/logindump" -o /tmp/g.json
node -e 'try{const d=require("/tmp/g.json");console.log("url:",d.url,"| title:",d.title);console.log("text:",String(d.text||"").slice(0,180).replace(/\s+/g," "));console.log("campi:",JSON.stringify(d.ctrls||[]).slice(0,300));}catch(e){console.log("dump vuoto")}'
echo "=== log ultimi 4 min (sequenza login/codice/conferma) ==="
journalctl -u groupama-scraper --no-pager --since "5 min ago" 2>/dev/null | sed 's/.*\[groupama\]/[groupama]/' | grep -iE "fill user|pagina OTP|codice ricevuto|invio|inseris|loggato|recovery|err|PRONTO|attesa" | tail -20
