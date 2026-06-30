systemctl start withus-autopull.service 2>/dev/null || true
for i in $(seq 1 18); do git -C /opt/withus-backend log --oneline -1 2>/dev/null | grep -q "fonte custom esistente" && break; sleep 5; done
echo "commit: $(git -C /opt/withus-backend log --oneline -1 2>/dev/null)"
echo "=== nome della fonte custom Prima ==="
python3 -c "import json;s=json.load(open('/opt/withus-backend/server/fonti.store.json'));cs=s.get('__custom') or {};[print(' ',k,'->',(v.get('nome') or ''),'| user:',('si' if v.get('username') else 'no'),'| totp:',('si' if v.get('totp') else 'no')) for k,v in cs.items() if 'prima' in k.lower() or 'prima' in (v.get('nome') or '').lower()]"
echo "=== /accedi Prima: arriva al passo codice? (non bloccante) ==="
curl -s --max-time 30 -X POST http://127.0.0.1:4600/accedi 2>/dev/null | head -c 250; echo
for i in 1 2 3 4 5 6; do sleep 5; echo "[$((i*5))s] $(curl -s --max-time 6 http://127.0.0.1:4600/loginstate 2>/dev/null | head -c 200)"; done
