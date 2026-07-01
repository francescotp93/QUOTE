curl -s -m 150 "http://127.0.0.1:4400/casaprobe" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
cc=d.get('casaControlli') or {}
print('controlliDeroga.status:', cc.get('status'))
print('  err:', (cc.get('err') or '')[:400])
cq=d.get('casaQuot') or {}
print('casaQuot.status:', cq.get('status'))
print('  err:', (cq.get('err') or '')[:400])
"
echo "---fine---"
