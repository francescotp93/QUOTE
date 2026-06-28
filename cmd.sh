echo "=== CONFERMA FATTORI ==="; curl -s --max-time 30 "http://127.0.0.1:4700/explore?click=CONFERMA%20FATTORI" >/dev/null 2>&1; sleep 3
echo "=== VAI ALLA QUOTAZIONE ==="; curl -s --max-time 40 "http://127.0.0.1:4700/explore?click=VAI%20ALLA%20QUOTAZIONE" >/dev/null 2>&1
sleep 16
echo "=== testo schermata ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('TEXT:',d.get('text','')[:700])
print('BTN:',[l['t'] for l in d.get('links',[]) if l['t'] and l['t'] not in ('0','N.A.','N.D.','CRM','DANNI','VITA','VITA PROTECTION','INCASSI','SINISTRI','INCENTIX')][:30])" 2>/dev/null
R=$(curl -s --max-time 25 "http://127.0.0.1:4700/shot?b64=1&q=16"); LEN=$(printf '%s' "$R"|wc -c)
echo "chars:$LEN"; [ "$LEN" -lt 92000 ] && printf '%s' "$R" || echo TOO_BIG
