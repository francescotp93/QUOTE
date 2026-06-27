set -u
echo "=== attendo l'esito dell'invio OTP ==="
for i in $(seq 1 10); do
  S=$(curl -s --max-time 8 "http://127.0.0.1:4500/status")
  echo "[$i] $S"
  echo "$S" | grep -q '"loggato":true\|"login_step":"loggato"\|attesa_otp\|timeout\|error\|non_loggato' && break
  sleep 6
done
echo "=== dove siamo (logindump) ==="
curl -s --max-time 30 "http://127.0.0.1:4500/logindump" -o /tmp/g.json
node -e 'try{const d=require("/tmp/g.json");console.log("url:",d.url);console.log("title:",d.title);console.log("text(250):",String(d.text||"").slice(0,250).replace(/\s+/g," "));console.log("campi:",JSON.stringify(d.ctrls||[]).slice(0,300));}catch(e){console.log("dump err")}'
