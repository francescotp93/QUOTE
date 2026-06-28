echo "=== riempio Data acquisto veicolo via xpath ==="
curl -s --max-time 35 -G "http://127.0.0.1:4700/explore" \
  --data-urlencode 'fill=13/02/2025' \
  --data-urlencode 'fillsel=xpath=(//*[contains(text(),"Data acquisto veicolo")]/following::input)[1]' >/dev/null 2>&1
sleep 1
echo "=== verifica valore campo + screenshot ==="
curl -s --max-time 40 "http://127.0.0.1:4700/explore" 2>/dev/null | python3 -c "import sys,json
d=json.load(sys.stdin)
print('errori testo:', 'Data acquisto' in d.get('text',''), '| fattori completi?', 'non sono completi' in d.get('text',''))" 2>/dev/null
R=$(curl -s --max-time 25 "http://127.0.0.1:4700/shot?b64=1&q=18"); LEN=$(printf '%s' "$R"|wc -c)
echo "chars:$LEN"; [ "$LEN" -lt 92000 ] && printf '%s' "$R" || echo TOO_BIG
