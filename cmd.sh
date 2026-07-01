set +e
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
FULL="081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009"
for pair in "Annuale:000001:1" "Semestrale:000002:2" "Mensile:000006:12"; do
  nome="${pair%%:*}"; rest="${pair#*:}"; code="${rest%%:*}"; n="${rest##*:}"
  R=$(curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL&frazcode=$code")
  echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('ok'):
    tot=d.get('premio_totale_num') or 0
    print('  $nome (code $code): totale € %.2f  →  rata € %.2f  (/$n)'%(tot, tot/$n))
else: print('  $nome ERR', (d.get('error') or '')[:70])
" 2>&1
done
echo "---fine---"
