systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 20); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "digitazione robusta" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
for i in $(seq 1 12); do curl -s --max-time 5 http://127.0.0.1:4200/status | grep -q loggato && break; sleep 3; done
curl -s --max-time 8 "http://127.0.0.1:4200/pausakeepalive?min=20" >/dev/null
echo "=== digito 'preventivatore motor' (no enter) e guardo l'autocompletamento ==="
curl -s --max-time 45 "http://127.0.0.1:4200/explore?goto=/matrix/&type=preventivatore%20motor&wait=6000" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('url:',(d.get('url') or '')[:90],'| frame:',d.get('nframes'))
for f in (d.get('frames') or []):
    ll=[x for x in (f.get('links') or []) if x.strip()]
    if ll: print('  voci:', ' · '.join(ll[:25]))
" 2>&1 | head -12
