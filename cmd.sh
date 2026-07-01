set +e
BASE="provincia=TP&tipo=1&mq=2&dimora=1&piano=2&cc=2&eta=5"
FULL="081035,081036,081278,081279,081280,081281,081282,081283,081284,091202,131065,135032,131067,131068,181009"
for code in 000001 000002 000003 000004 000005 000006 000007 000008 000009 000010 000011 000012 000013; do
  R=$(curl -s --max-time 90 "http://127.0.0.1:4400/premio-casa?$BASE&garanzie=$FULL&frazcode=$code")
  echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('ok'): print('  $code VALIDO  lordo',d.get('premio_totale'))
else:
  import re
  e=d.get('error') or ''
  print('  $code  ERR')
" 2>&1
done
echo "---fine---"
