systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 24); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "iframe-aware" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 15); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
curl -s --max-time 10 "http://127.0.0.1:4200/pausakeepalive?min=15" >/dev/null 2>&1
echo "=== /explore portale /matrix/ (frame + menu) ==="
curl -s --max-time 70 "http://127.0.0.1:4200/explore?goto=/matrix/&wait=5000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:', (d.get('url') or '')[:90], '| frame:', d.get('nframes'))
for f in (d.get('frames') or []):
    print('---FRAME', (f.get('url') or '')[:80], '| bodylen', f.get('bodylen'), '| nlink', f.get('nlinks'))
    ll=f.get('links') or []
    if ll: print('   menu/link:', ' · '.join(ll[:25]))
    ff=f.get('fields') or []
    if ff: print('   campi:', [ (x.get('name') or x.get('id') or x.get('ph') or x.get('type')) for x in ff[:12] ])
"
