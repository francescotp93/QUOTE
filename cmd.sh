systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "sniffer lato server" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 15); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
curl -s --max-time 8 "http://127.0.0.1:4200/pausakeepalive?min=15" >/dev/null
echo "=== sniff ON ==="
curl -s --max-time 8 "http://127.0.0.1:4200/sniff/start" 2>/dev/null; echo
echo "=== navigo la landing Matrix (cattura chiamate init/menu) ==="
curl -s --max-time 40 "http://127.0.0.1:4200/explore?goto=/matrix/&wait=6000" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('url:',(d.get('url') or '')[:80],'| frame:',d.get('nframes'));[print('  link:',' · '.join((f.get('links') or [])[:20])) for f in (d.get('frames') or []) if f.get('links')]" 2>&1 | head -10
echo "=== sniff OFF (salva + riepilogo chiamate) ==="
curl -s --max-time 15 "http://127.0.0.1:4200/sniff/stop" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('totali:',d.get('totali'))
for c in (d.get('chiamate') or [])[:40]: print(' ',c.get('status'),(c.get('url') or '').split('?')[0][-70:])
" 2>&1 | head -45
