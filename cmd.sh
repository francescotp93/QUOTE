set +e
for code in 1 2 3 4 6 8 12; do
  R=$(curl -s --max-time 120 "http://127.0.0.1:4400/premio-tcm?capitale=150000&durata=30&nascita=17/07/1993&eta=33&fumatore=1&frazcode=$code&prodotto=TCM07H.7")
  echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  frazcode $code ->','premio',d.get('premio_lordo')) if d.get('ok') else print('  frazcode $code -> ERR',(d.get('error') or '')[:50])" 2>&1
done
echo "---fine---"
