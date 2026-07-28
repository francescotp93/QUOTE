#!/usr/bin/env bash
set -u
echo "=== fonti salvate nello store (nomi soli, niente segreti) ==="
node -e "
const s=JSON.parse(require('fs').readFileSync('/opt/withus-backend/server/fonti.store.json','utf8'));
const fix=Object.keys(s).filter(k=>k!=='__custom');
const cus=Object.keys(s.__custom||{});
console.log('  fisse :',fix.join(', '));
console.log('  custom:',cus.join(', '));
const all={...s,...(s.__custom||{})};
for(const k of [...fix,...cus]){const v=all[k]||{};if(/rc|polizza/i.test(k)||/rc|polizza/i.test(v.nome||''))console.log('  >> RC POLIZZA:',k,'| nome:',v.nome||'-','| user:',!!v.username,'| pass:',!!v.password,'| url:',v.url||v.loginUrl||'-');}
" 2>&1
echo
echo "=== backend vivo e /fonti risponde? ==="
systemctl is-active withus-backend
curl -s -o /dev/null --max-time 10 -w "  GET /fonti -> %{http_code} (401=ok, serve login)\n" http://127.0.0.1:3000/fonti
echo
echo "=== errori CORS/origin negli ultimi 20 min ==="
journalctl -u withus-backend --since "20 min ago" --no-pager 2>/dev/null | grep -iE "origin non consentito|error" | tail -8 || echo "  nessuno"
echo "FINE."
